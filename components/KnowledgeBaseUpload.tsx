'use client'

import * as React from 'react'
import {
  useRAGKnowledgeBase,
  isFileSupportedByTypeOrExtension,
  type RAGDocument,
} from '@/lib/ragKnowledgeBase'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Icons (inline SVGs -- no external icon library)
// ---------------------------------------------------------------------------

function UploadCloudIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16V8m0 0l-3 3m3-3l3 3M7 20a5 5 0 01-1-9.9V10a5 5 0 0110 0h.1A5 5 0 0117 20H7z"
      />
    </svg>
  )
}

function FileIcon({ className, color }: { className?: string; color?: string }) {
  return (
    <svg
      className={cn('h-5 w-5', color, className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  )
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

function AlertCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// File type helpers
// ---------------------------------------------------------------------------

const FILE_TYPE_COLOR: Record<string, string> = {
  pdf: 'text-red-500',
  docx: 'text-blue-500',
  doc: 'text-blue-500',
  txt: 'text-gray-500',
}

function fileIconColor(fileType: string): string {
  return FILE_TYPE_COLOR[fileType] ?? 'text-muted-foreground'
}

const ACCEPTED_FILES =
  '.pdf,.docx,.doc,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain'

// ---------------------------------------------------------------------------
// Upload status types
// ---------------------------------------------------------------------------

type UploadStatus =
  | { kind: 'idle' }
  | { kind: 'uploading'; fileName: string }
  | { kind: 'verified'; fileName: string }
  | { kind: 'indexing'; fileName: string }
  | { kind: 'error'; message: string }

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface KnowledgeBaseUploadProps {
  ragId: string
  className?: string
  onUploadSuccess?: (document: { documentCount?: number }) => void
  onDeleteSuccess?: (fileName: string) => void
}

export function KnowledgeBaseUpload({
  ragId,
  className,
  onUploadSuccess,
  onDeleteSuccess,
}: KnowledgeBaseUploadProps) {
  const {
    documents,
    loading,
    error,
    fetchDocuments,
    uploadDocument,
    removeDocuments,
  } = useRAGKnowledgeBase()

  const [isDragging, setIsDragging] = React.useState(false)
  const [status, setStatus] = React.useState<UploadStatus>({ kind: 'idle' })
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const statusTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch documents on mount and when ragId changes
  React.useEffect(() => {
    fetchDocuments(ragId)
  }, [ragId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup auto-clear timer
  React.useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Drag-and-drop handlers
  // ---------------------------------------------------------------------------

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only leave if we actually exited the drop zone (not a child element)
    const rect = e.currentTarget.getBoundingClientRect()
    const { clientX, clientY } = e
    if (
      clientX <= rect.left ||
      clientX >= rect.right ||
      clientY <= rect.top ||
      clientY >= rect.bottom
    ) {
      setIsDragging(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      await processFile(files[0])
    }
  }

  // ---------------------------------------------------------------------------
  // File selection
  // ---------------------------------------------------------------------------

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      await processFile(files[0])
    }
    // Always reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const openFilePicker = () => {
    if (status.kind === 'uploading') return
    fileInputRef.current?.click()
  }

  // ---------------------------------------------------------------------------
  // Upload logic
  // ---------------------------------------------------------------------------

  const clearStatusAfterDelay = (ms: number) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    statusTimerRef.current = setTimeout(() => {
      setStatus({ kind: 'idle' })
    }, ms)
  }

  const processFile = async (file: File) => {
    // Validate
    if (!isFileSupportedByTypeOrExtension(file)) {
      const ext = (file.name || '').split('.').pop()?.toLowerCase() || 'unknown'
      setStatus({
        kind: 'error',
        message: `".${ext}" files are not supported. Please use PDF, DOCX, DOC, or TXT.`,
      })
      return
    }

    setStatus({ kind: 'uploading', fileName: file.name })

    try {
      const result = await uploadDocument(ragId, file)

      if (result.success) {
        const verified = result.verified === true

        if (verified) {
          setStatus({ kind: 'verified', fileName: file.name })
        } else {
          setStatus({ kind: 'indexing', fileName: file.name })
        }

        // Schedule multiple refreshes to catch indexing lag
        await fetchDocuments(ragId)
        setTimeout(() => fetchDocuments(ragId), 3000)
        setTimeout(() => fetchDocuments(ragId), 7000)

        onUploadSuccess?.({ documentCount: result.documentCount })

        // Auto-clear the success/indexing message after a few seconds
        clearStatusAfterDelay(6000)
      } else {
        setStatus({
          kind: 'error',
          message: result.error || 'Upload failed. Please try again.',
        })
      }
    } catch {
      setStatus({
        kind: 'error',
        message: 'Could not reach the server. Please check your connection and try again.',
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  const handleDelete = async (fileName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${fileName}"? This action cannot be undone.`
    )
    if (!confirmed) return

    const result = await removeDocuments(ragId, [fileName])

    if (result.success) {
      onDeleteSuccess?.(fileName)
    } else {
      setStatus({
        kind: 'error',
        message: result.error || 'Failed to delete the document. Please try again.',
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const isUploading = status.kind === 'uploading'
  const docList = Array.isArray(documents) ? documents : []
  const showError = status.kind === 'error' ? status.message : error ?? null

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={cn('w-full space-y-4', className)}>
      {/* ----------------------------------------------------------------- */}
      {/* Drop zone / upload area                                           */}
      {/* ----------------------------------------------------------------- */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a document"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFilePicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openFilePicker()
          }
        }}
        className={cn(
          'relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 outline-none',
          isUploading
            ? 'cursor-wait border-muted-foreground/30 bg-muted/30'
            : 'cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isDragging && !isUploading
            ? 'border-primary bg-primary/5 scale-[1.01] shadow-sm'
            : !isUploading && 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/20'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILES}
          onChange={handleFileSelect}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />

        {/* Uploading state */}
        {status.kind === 'uploading' && (
          <div className="flex flex-col items-center gap-3">
            <SpinnerIcon className="h-10 w-10 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Uploading {status.fileName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Processing and indexing your document...
              </p>
            </div>
            <div className="h-1.5 w-40 rounded-full bg-muted overflow-hidden">
              <div className="h-full w-full bg-primary/60 rounded-full animate-pulse" />
            </div>
          </div>
        )}

        {/* Verified (uploaded and indexed) */}
        {status.kind === 'verified' && (
          <div className="flex flex-col items-center gap-2">
            <CheckCircleIcon className="h-10 w-10 text-green-500" />
            <p className="text-sm font-medium text-green-600">
              Uploaded and indexed
            </p>
            <p className="text-xs text-muted-foreground">
              {status.fileName} is ready to use
            </p>
          </div>
        )}

        {/* Indexing in progress */}
        {status.kind === 'indexing' && (
          <div className="flex flex-col items-center gap-2">
            <AlertCircleIcon className="h-10 w-10 text-amber-500" />
            <p className="text-sm font-medium text-amber-600">
              Uploaded, indexing in progress
            </p>
            <p className="text-xs text-muted-foreground">
              {status.fileName} may take a moment to appear in search results
            </p>
          </div>
        )}

        {/* Default / idle state */}
        {(status.kind === 'idle' || status.kind === 'error') && (
          <div className="flex flex-col items-center gap-2">
            <UploadCloudIcon
              className={cn(
                'h-10 w-10 transition-colors duration-200',
                isDragging ? 'text-primary' : 'text-muted-foreground'
              )}
            />
            <div>
              <p className="text-sm font-medium text-foreground">
                {isDragging ? 'Drop your file here' : 'Drag and drop or click to upload'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                PDF, DOCX, DOC, or TXT
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Error display                                                     */}
      {/* ----------------------------------------------------------------- */}
      {showError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <AlertCircleIcon className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
          <p className="text-sm text-destructive leading-snug">{showError}</p>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Document list                                                     */}
      {/* ----------------------------------------------------------------- */}
      {loading && !documents ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <SpinnerIcon className="h-4 w-4" />
          <span>Loading documents...</span>
        </div>
      ) : docList.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground">
            Uploaded Documents
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({docList.length})
            </span>
          </h4>
          <div className="divide-y divide-border rounded-md border border-border bg-card">
            {docList.map((doc: RAGDocument) => (
              <div
                key={doc.fileName}
                className="flex items-center justify-between gap-3 px-3 py-2.5 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileIcon color={fileIconColor(doc.fileType)} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate text-foreground">
                      {doc.fileName}
                    </p>
                    {(doc.documentCount != null && doc.documentCount > 0) && (
                      <p className="text-xs text-muted-foreground">
                        {doc.documentCount} chunk{doc.documentCount === 1 ? '' : 's'}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(doc.fileName)
                  }}
                  disabled={loading}
                  aria-label={`Delete ${doc.fileName}`}
                  className="h-8 w-8 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive transition-opacity"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : !loading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No documents uploaded yet
        </p>
      ) : null}
    </div>
  )
}
