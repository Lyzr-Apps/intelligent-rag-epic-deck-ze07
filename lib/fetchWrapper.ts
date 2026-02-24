import { isInIframe } from "@/components/ErrorBoundary";

const sendErrorToParent = (
  message: string,
  status?: number,
  endpoint?: string,
) => {
  console.error(`[FetchWrapper] ${message}`, { status, endpoint });

  if (isInIframe()) {
    window.parent.postMessage(
      {
        source: "architect-child-app",
        type: "CHILD_APP_ERROR",
        payload: {
          type: status && status >= 500 ? "api_error" : "network_error",
          message,
          timestamp: new Date().toISOString(),
          url: window.location.href,
          endpoint,
          status,
        },
      },
      "*",
    );
  }
};

const fetchWrapper = async (...args: Parameters<typeof fetch>): Promise<Response | undefined> => {
  const requestUrl = typeof args[0] === "string" ? args[0] : (args[0] instanceof URL ? args[0].href : (args[0] as Request)?.url || "");
  // Only send error to parent for critical agent API calls, not for RAG/upload/scheduler
  const isCriticalEndpoint = requestUrl.includes("/api/agent") && !requestUrl.includes("/api/rag") && !requestUrl.includes("/api/upload") && !requestUrl.includes("/api/scheduler");

  try {
    const response = await fetch(...args);

    // if backend sent a redirect
    if (response.redirected) {
      window.location.href = response.url;
      return;
    }

    // Tool authentication required on /api/agent - notify parent to open connection wizard
    if (response.status === 401) {
      if (requestUrl.includes("/api/agent")) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const cloned = response.clone();
          try {
            const body = await cloned.json();
            if (body?.detail?.type === "tool_auth" && isInIframe()) {
              const detail = body.detail;
              window.parent.postMessage(
                {
                  source: "architect-child-app",
                  type: "TOOL_AUTH_REQUIRED",
                  payload: {
                    tool_name: detail.tool_name,
                    tool_source: detail.tool_source,
                    action_names: detail.action_names,
                    reason: detail.reason,
                  },
                },
                "*",
              );
            }
          } catch {
            // JSON parse failed, ignore
          }
        }
      }
      return response;
    }

    if (response.status == 404) {
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("text/html")) {
        const html = await response.text();
        document.open();
        document.write(html);
        document.close();
        return;
      } else {
        if (isCriticalEndpoint) {
          sendErrorToParent(
            `Backend returned 404 Not Found for ${requestUrl}`,
            404,
            requestUrl,
          );
        }
        return response;
      }
    } else if (response.status >= 500) {
      if (isCriticalEndpoint) {
        sendErrorToParent(
          `Backend returned ${response.status} error for ${requestUrl}`,
          response.status,
          requestUrl,
        );
      }
      return response;
    }

    return response;
  } catch (error) {
    // network failures — only notify parent for critical endpoints
    if (isCriticalEndpoint) {
      sendErrorToParent(
        `Network error: Cannot connect to backend (${requestUrl})`,
        undefined,
        requestUrl,
      );
    }
    // Return undefined — callers must check for null/undefined response
    console.error(`[FetchWrapper] Network error for ${requestUrl}:`, error);
    return undefined;
  }
};

export default fetchWrapper;
