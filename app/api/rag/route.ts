/**
 * Server-side RAG Knowledge Base API Route
 *
 * Proxies requests to the Lyzr RAG API v3 (https://rag-prod.studio.lyzr.ai)
 *
 * Operations:
 *   GET    - Health check or list documents (?ragId=xxx)
 *   POST   - List documents (JSON { ragId }) or upload/train (FormData with ragId + file)
 *   PATCH  - Crawl a website into a knowledge base
 *   DELETE - Remove documents from a knowledge base
 *
 * NEVER expose LYZR_API_KEY to the client -- always proxy through this route.
 */

import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RAG_BASE_URL = "https://rag-prod.studio.lyzr.ai/v3";
const CRAWL_URL = "https://api.beta.architect.new/api/v1/rag/crawl";

/**
 * Read the API key lazily so tests / hot-reloads always pick up the latest
 * value from the environment.
 */
function getApiKey(): string {
  return process.env.LYZR_API_KEY ?? "";
}

// ---------------------------------------------------------------------------
// File-type resolution
// ---------------------------------------------------------------------------

type SupportedFileType = "pdf" | "docx" | "txt";

const MIME_TO_FILE_TYPE: Record<string, SupportedFileType> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "docx",
  "text/plain": "txt",
};

const EXTENSION_TO_FILE_TYPE: Record<string, SupportedFileType> = {
  pdf: "pdf",
  docx: "docx",
  doc: "docx",
  txt: "txt",
  text: "txt",
};

/**
 * Determine the file type from MIME type first, then fall back to extension.
 */
function resolveFileType(file: File): SupportedFileType | null {
  // 1. MIME type takes priority
  if (file.type && MIME_TO_FILE_TYPE[file.type]) {
    return MIME_TO_FILE_TYPE[file.type];
  }

  // 2. Extension fallback
  const ext = (file.name ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (ext && EXTENSION_TO_FILE_TYPE[ext]) {
    return EXTENSION_TO_FILE_TYPE[ext];
  }

  return null;
}

// ---------------------------------------------------------------------------
// Document-list helpers
// ---------------------------------------------------------------------------

interface ParsedDocument {
  fileName: string;
  fileType: string;
  status: string;
}

/**
 * Parse the raw response from the Lyzr documents endpoint into a uniform
 * array of `ParsedDocument` objects.  The API returns an array of file-path
 * strings such as `["storage/voicestream-dev-guide.pdf"]`.
 */
function parseDocumentList(raw: unknown): ParsedDocument[] {
  const paths: string[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.documents)
      ? (raw as Record<string, unknown>).documents as string[]
      : Array.isArray((raw as Record<string, unknown>)?.data)
        ? (raw as Record<string, unknown>).data as string[]
        : [];

  return paths.map((filePath: string) => {
    const fileName = filePath.split("/").pop() || filePath;
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    let fileType: string;
    switch (ext) {
      case "pdf":
        fileType = "pdf";
        break;
      case "docx":
      case "doc":
        fileType = "docx";
        break;
      case "txt":
      case "text":
        fileType = "txt";
        break;
      default:
        fileType = "unknown";
    }
    return { fileName, fileType, status: "active" };
  });
}

/**
 * Fetch the document list for a given `ragId` from the Lyzr API.
 * Returns `{ ok, documents, raw, status }`.
 */
async function fetchDocumentList(
  ragId: string,
  apiKey: string,
): Promise<{
  ok: boolean;
  documents: ParsedDocument[];
  count: number;
  status: number;
  errorText?: string;
}> {
  const url = `${RAG_BASE_URL}/rag/documents/${encodeURIComponent(ragId)}/`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": apiKey,
      },
    });
  } catch (err) {
    return {
      ok: false,
      documents: [],
      count: 0,
      status: 502,
      errorText: `Network error contacting RAG API: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unable to read error body");
    return { ok: false, documents: [], count: 0, status: response.status, errorText };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return {
      ok: false,
      documents: [],
      count: 0,
      status: 502,
      errorText: "RAG API returned non-JSON response when listing documents",
    };
  }

  const documents = parseDocumentList(data);
  return { ok: true, documents, count: documents.length, status: 200 };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function missingKeyResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: "LYZR_API_KEY is not configured on the server" },
    { status: 500 },
  );
}

function errorResponse(
  message: string,
  status: number,
  details?: string,
): NextResponse {
  const body: Record<string, unknown> = { success: false, error: message };
  if (details) {
    body.details = details;
  }
  return NextResponse.json(body, { status });
}

/**
 * Promise-based delay.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// GET  --  Health check or list documents via ?ragId=xxx
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return missingKeyResponse();

    const ragId = request.nextUrl.searchParams.get("ragId");

    // Health check when no ragId is supplied
    if (!ragId) {
      return NextResponse.json({
        success: true,
        message: "RAG API is available. Provide ?ragId= to list documents.",
        timestamp: new Date().toISOString(),
      });
    }

    const result = await fetchDocumentList(ragId, apiKey);

    if (!result.ok) {
      return errorResponse(
        `Failed to list documents: HTTP ${result.status}`,
        result.status,
        result.errorText,
      );
    }

    return NextResponse.json({
      success: true,
      documents: result.documents,
      documentCount: result.count,
      ragId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error in GET /api/rag",
      500,
    );
  }
}

// ---------------------------------------------------------------------------
// POST  --  List documents (JSON) or upload & train (FormData)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return missingKeyResponse();

    const contentType = request.headers.get("content-type") ?? "";

    // ----- JSON body: list documents -----------------------------------
    if (contentType.includes("application/json")) {
      return await handleListDocuments(request, apiKey);
    }

    // ----- FormData body: upload & train -------------------------------
    return await handleUploadAndTrain(request, apiKey);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error in POST /api/rag",
      500,
    );
  }
}

/**
 * POST with JSON body `{ ragId }` -- list documents (same semantics as
 * GET with ?ragId).
 */
async function handleListDocuments(
  request: NextRequest,
  apiKey: string,
): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const ragId = body.ragId as string | undefined;
  if (!ragId || typeof ragId !== "string") {
    return errorResponse("ragId (string) is required in the JSON body", 400);
  }

  const result = await fetchDocumentList(ragId, apiKey);

  if (!result.ok) {
    return errorResponse(
      `Failed to list documents: HTTP ${result.status}`,
      result.status,
      result.errorText,
    );
  }

  return NextResponse.json({
    success: true,
    documents: result.documents,
    documentCount: result.count,
    ragId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST with FormData body containing `ragId` and `file` -- upload a document
 * and train the RAG model on it.
 *
 * File-type routing:
 *   PDF  -> POST /v3/train/pdf/?rag_id=...  (file only)
 *   DOCX -> POST /v3/train/docx/?rag_id=... (try WITHOUT data_parser first;
 *           if that fails with 4xx, retry WITH data_parser=docx2txt)
 *   TXT  -> POST /v3/train/txt/?rag_id=...  (file + data_parser=simple)
 *
 * CRITICAL: We never set a Content-Type header when sending FormData -- the
 *   runtime will set it automatically with the correct multipart boundary.
 */
async function handleUploadAndTrain(
  request: NextRequest,
  apiKey: string,
): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(
      "Expected multipart/form-data body with ragId and file fields",
      400,
    );
  }

  const ragId = formData.get("ragId") as string | null;
  const file = formData.get("file") as File | null;

  if (!ragId || typeof ragId !== "string") {
    return errorResponse("ragId field is required in the form data", 400);
  }
  if (!file || !(file instanceof File) || file.size === 0) {
    return errorResponse("A non-empty file field is required in the form data", 400);
  }

  const fileType = resolveFileType(file);
  if (!fileType) {
    return errorResponse(
      `Unsupported file type: MIME="${file.type || "unknown"}", name="${file.name}". Supported types: PDF, DOCX, TXT.`,
      400,
    );
  }

  const trainUrl = `${RAG_BASE_URL}/train/${fileType}/?rag_id=${encodeURIComponent(ragId)}`;

  // -------------------------------------------------------------------
  // Build FormData for the upstream request.
  //
  // CRITICAL: Do NOT set Content-Type header -- let the runtime set the
  // multipart boundary automatically.
  // -------------------------------------------------------------------

  const buildFormData = (includeParser: boolean): FormData => {
    const fd = new FormData();
    fd.append("file", file, file.name);

    if (includeParser) {
      if (fileType === "docx") {
        fd.append("data_parser", "docx2txt");
      } else if (fileType === "txt") {
        fd.append("data_parser", "simple");
      }
      // PDF: never send data_parser
    }

    return fd;
  };

  /**
   * Execute the upload request against the Lyzr train endpoint.
   */
  const doUpload = async (fd: FormData): Promise<Response> => {
    return fetch(trainUrl, {
      method: "POST",
      headers: {
        // Only auth + accept; NO Content-Type -- let runtime handle boundary
        "x-api-key": apiKey,
        accept: "application/json",
      },
      body: fd,
    });
  };

  let trainResponse: Response;

  if (fileType === "docx") {
    // ---------------------------------------------------------------
    // DOCX strategy:
    //   1. Try WITHOUT data_parser first (API has a default of "docx2txt").
    //      Some servers reject an explicit value that matches their default.
    //   2. If that fails with a 4xx error, retry WITH data_parser=docx2txt
    //      explicitly.
    // ---------------------------------------------------------------
    trainResponse = await doUpload(buildFormData(false));

    if (!trainResponse.ok && trainResponse.status >= 400 && trainResponse.status < 500) {
      // Consume body so the connection is freed
      await trainResponse.text().catch(() => {});
      trainResponse = await doUpload(buildFormData(true));
    }
  } else if (fileType === "txt") {
    // TXT always needs data_parser=simple
    trainResponse = await doUpload(buildFormData(true));
  } else {
    // PDF -- no parser needed
    trainResponse = await doUpload(buildFormData(false));
  }

  if (!trainResponse.ok) {
    const errorText = await trainResponse.text().catch(() => "Unable to read error body");
    return errorResponse(
      `Failed to process ${fileType.toUpperCase()} document "${file.name}". ` +
        `Upstream returned HTTP ${trainResponse.status}. Ensure the file is valid and not corrupted.`,
      trainResponse.status,
      errorText,
    );
  }

  // Try to parse the train response body (may not always be JSON)
  let trainData: Record<string, unknown> = {};
  try {
    trainData = await trainResponse.json();
  } catch {
    // Non-JSON response is acceptable -- continue
  }

  // -------------------------------------------------------------------
  // Verification: wait 1 second for indexing, then check the doc list.
  // -------------------------------------------------------------------
  let verified = false;
  let documentCount = 0;

  try {
    await delay(1000);

    const verifyResult = await fetchDocumentList(ragId, apiKey);

    if (verifyResult.ok) {
      documentCount = verifyResult.count;

      // Check whether our file appears in the list
      const baseName = file.name.split(".")[0].toLowerCase();
      verified = verifyResult.documents.some((doc) => {
        const docBase = doc.fileName.toLowerCase();
        return docBase === file.name.toLowerCase() || docBase.includes(baseName);
      });
    }
  } catch {
    // Verification is best-effort; upload may still have succeeded
  }

  return NextResponse.json({
    success: true,
    verified,
    fileName: file.name,
    fileType,
    documentCount:
      (trainData.document_count as number) ??
      (trainData.chunks as number) ??
      documentCount ??
      1,
    ragId,
    message: verified
      ? "Document uploaded and indexed successfully"
      : "Document uploaded. It may take a moment to appear in your document list.",
    timestamp: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// PATCH  --  Crawl a website into a knowledge base
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return missingKeyResponse();

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const ragId = body.ragId as string | undefined;
    const url = body.url as string | undefined;

    if (!ragId || typeof ragId !== "string") {
      return errorResponse("ragId (string) is required", 400);
    }
    if (!url || typeof url !== "string") {
      return errorResponse("url (string) is required", 400);
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      return errorResponse(`Invalid URL provided: "${url}"`, 400);
    }

    let response: Response;
    try {
      response = await fetch(CRAWL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({ url, rag_id: ragId }),
      });
    } catch (err) {
      return errorResponse(
        `Network error contacting crawl API: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unable to read error body");
      return errorResponse(
        `Failed to crawl website: HTTP ${response.status}`,
        response.status,
        errorText,
      );
    }

    let responseData: Record<string, unknown> = {};
    try {
      responseData = await response.json();
    } catch {
      // Non-JSON is fine
    }

    return NextResponse.json({
      success: true,
      message: "Website crawl initiated successfully. Content will be available shortly.",
      url,
      ragId,
      ...(Object.keys(responseData).length > 0 ? { data: responseData } : {}),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error in PATCH /api/rag",
      500,
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE  --  Remove documents from a knowledge base
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return missingKeyResponse();

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const ragId = body.ragId as string | undefined;
    const documentNames = body.documentNames;

    if (!ragId || typeof ragId !== "string") {
      return errorResponse("ragId (string) is required", 400);
    }
    if (!Array.isArray(documentNames) || documentNames.length === 0) {
      return errorResponse(
        "documentNames must be a non-empty array of strings",
        400,
      );
    }

    // Validate every entry is a non-empty string
    for (let i = 0; i < documentNames.length; i++) {
      if (typeof documentNames[i] !== "string" || documentNames[i].length === 0) {
        return errorResponse(
          `documentNames[${i}] must be a non-empty string`,
          400,
        );
      }
    }

    const deleteUrl = `${RAG_BASE_URL}/rag/${encodeURIComponent(ragId)}/docs/`;

    let response: Response;
    try {
      response = await fetch(deleteUrl, {
        method: "DELETE",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(documentNames),
      });
    } catch (err) {
      return errorResponse(
        `Network error contacting RAG API: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unable to read error body");
      return errorResponse(
        `Failed to delete documents: HTTP ${response.status}`,
        response.status,
        errorText,
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${documentNames.length} document(s)`,
      deletedDocuments: documentNames,
      deletedCount: documentNames.length,
      ragId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error in DELETE /api/rag",
      500,
    );
  }
}
