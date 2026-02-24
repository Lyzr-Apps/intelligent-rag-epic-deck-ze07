'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import type { AIAgentResponse } from '@/lib/aiAgent'
import { KnowledgeBaseUpload } from '@/components/KnowledgeBaseUpload'
import { useRAGKnowledgeBase } from '@/lib/ragKnowledgeBase'
import type { RAGDocument } from '@/lib/ragKnowledgeBase'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  BookOpen,
  Send,
  FileText,
  GraduationCap,
  HelpCircle,
  FolderOpen,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  Clock,
  Target,
  Lightbulb,
  BookMarked,
  Upload,
  Sparkles,
  MessageSquare,
  ArrowRight,
  RotateCcw,
  Trophy,
  Star,
  ListChecks,
  Brain,
  CircleDot,
  Check,
  X,
} from 'lucide-react'

// ============================================================================
// CONSTANTS
// ============================================================================

const DOC_QA_AGENT_ID = '699da2284d9b8b973a73e350'
const STUDY_PLAN_AGENT_ID = '699da2297c54a9ee105c1693'
const QUIZ_AGENT_ID = '699da2294d9b8b973a73e352'
const RAG_ID = '699da1fab45a5c2df18f0f4a'

const AGENTS = [
  { id: DOC_QA_AGENT_ID, name: 'Document Q&A', icon: MessageSquare, purpose: 'Answers questions from your uploaded documents with citations' },
  { id: STUDY_PLAN_AGENT_ID, name: 'Study Planner', icon: GraduationCap, purpose: 'Creates structured multi-day study plans from your materials' },
  { id: QUIZ_AGENT_ID, name: 'Quiz Generator', icon: HelpCircle, purpose: 'Generates adaptive quizzes grounded in your uploaded content' },
]

// ============================================================================
// INTERFACES
// ============================================================================

interface Citation {
  source?: string
  page?: string
  excerpt?: string
}

interface DocQAResponse {
  answer?: string
  citations?: Citation[]
  confidence?: string
  follow_up_suggestions?: string[]
}

interface StudyDay {
  day_number?: number
  topic?: string
  subtopics?: string[]
  learning_objectives?: string[]
  estimated_hours?: number
  practice_tasks?: string[]
  resources?: string[]
}

interface StudyPlanResponse {
  title?: string
  overview?: string
  total_duration?: string
  difficulty_level?: string
  days?: StudyDay[]
  grounded_in_documents?: boolean
  tips?: string[]
}

interface QuizQuestion {
  question_number?: number
  question_type?: string
  question?: string
  options?: string[]
  correct_answer?: string
  explanation?: string
  difficulty?: string
}

interface QuizResponse {
  quiz_title?: string
  topic?: string
  total_questions?: number
  questions?: QuizQuestion[]
  grounded_in_documents?: boolean
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  data?: DocQAResponse
  timestamp: string
}

// ============================================================================
// LOCALSTORAGE HELPERS
// ============================================================================

const CHAT_STORAGE_KEY = 'learnagent_chat_history'
const SESSION_STORAGE_KEY = 'learnagent_session_id'

function loadChatHistory(): ChatMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveChatHistory(messages: ChatMessage[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages))
  } catch {
    // silently fail
  }
}

function clearChatHistory() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(CHAT_STORAGE_KEY)
  } catch {
    // silently fail
  }
}

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'default'
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY)
    if (stored) return stored
    const newId = crypto.randomUUID()
    localStorage.setItem(SESSION_STORAGE_KEY, newId)
    return newId
  } catch {
    return crypto.randomUUID()
  }
}

function resetSessionId(): string {
  if (typeof window === 'undefined') return 'default'
  try {
    const newId = crypto.randomUUID()
    localStorage.setItem(SESSION_STORAGE_KEY, newId)
    return newId
  } catch {
    return crypto.randomUUID()
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function parseAgentResponse(result: AIAgentResponse, fields: string[]): Record<string, unknown> {
  let data = result?.response?.result
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      // keep as string
    }
  }
  if (data && typeof data === 'object') {
    const hasFields = fields.some((f) => f in (data as Record<string, unknown>))
    if (hasFields) return data as Record<string, unknown>
  }
  const unwrapKeys = ['result', 'response', 'data', 'output', 'content']
  let current = data as Record<string, unknown> | undefined
  for (let i = 0; i < 3; i++) {
    if (!current || typeof current !== 'object') break
    for (const key of unwrapKeys) {
      if (current[key] && typeof current[key] === 'object') {
        const candidate = current[key] as Record<string, unknown>
        if (fields.some((f) => f in candidate)) return candidate
      }
    }
    for (const key of unwrapKeys) {
      if (current[key] && typeof current[key] === 'object') {
        current = current[key] as Record<string, unknown>
        break
      }
    }
  }
  return (data as Record<string, unknown>) || {}
}

function formatInline(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {part}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  )
}

function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return (
            <h4 key={i} className="font-semibold text-sm mt-3 mb-1 font-serif text-foreground">
              {line.slice(4)}
            </h4>
          )
        if (line.startsWith('## '))
          return (
            <h3 key={i} className="font-semibold text-base mt-3 mb-1 font-serif text-foreground">
              {line.slice(3)}
            </h3>
          )
        if (line.startsWith('# '))
          return (
            <h2 key={i} className="font-bold text-lg mt-4 mb-2 font-serif text-foreground">
              {line.slice(2)}
            </h2>
          )
        if (line.startsWith('- ') || line.startsWith('* '))
          return (
            <li key={i} className="ml-4 list-disc text-sm leading-relaxed text-foreground/90">
              {formatInline(line.slice(2))}
            </li>
          )
        if (/^\d+\.\s/.test(line))
          return (
            <li key={i} className="ml-4 list-decimal text-sm leading-relaxed text-foreground/90">
              {formatInline(line.replace(/^\d+\.\s/, ''))}
            </li>
          )
        if (!line.trim()) return <div key={i} className="h-1" />
        return (
          <p key={i} className="text-sm leading-relaxed text-foreground/90">
            {formatInline(line)}
          </p>
        )
      })}
    </div>
  )
}

function getConfidenceColor(confidence: string): string {
  const c = (confidence ?? '').toLowerCase()
  if (c === 'high') return 'bg-green-100 text-green-800 border-green-300'
  if (c === 'medium') return 'bg-amber-100 text-amber-800 border-amber-300'
  if (c === 'low') return 'bg-red-100 text-red-800 border-red-300'
  return 'bg-muted text-muted-foreground'
}

function getDifficultyColor(difficulty: string): string {
  const d = (difficulty ?? '').toLowerCase()
  if (d === 'easy' || d === 'beginner') return 'bg-green-100 text-green-800 border-green-300'
  if (d === 'medium' || d === 'intermediate') return 'bg-amber-100 text-amber-800 border-amber-300'
  if (d === 'hard' || d === 'advanced') return 'bg-red-100 text-red-800 border-red-300'
  return 'bg-muted text-muted-foreground'
}

// ============================================================================
// SAMPLE DATA
// ============================================================================

const SAMPLE_CHAT: ChatMessage[] = [
  {
    role: 'user',
    content: 'What are the main principles of machine learning discussed in the document?',
    timestamp: '10:30 AM',
  },
  {
    role: 'assistant',
    content: '',
    data: {
      answer:
        '## Key Principles of Machine Learning\n\nBased on your uploaded documents, the main principles discussed include:\n\n### 1. Supervised Learning\nThe document covers **supervised learning** extensively, describing how models learn from labeled training data to make predictions on new, unseen data.\n\n### 2. Feature Engineering\nA significant section focuses on **feature engineering** -- the process of selecting, transforming, and creating input variables that best represent the underlying problem.\n\n### 3. Model Evaluation\nThe materials emphasize proper **model evaluation** using techniques like cross-validation, precision-recall metrics, and confusion matrices.\n\n- Always split data into training and test sets\n- Use k-fold cross-validation for robust estimates\n- Monitor for overfitting by comparing training vs validation loss',
      citations: [
        {
          source: 'ML_Fundamentals.pdf',
          page: 'Chapter 3, p.45',
          excerpt: 'Supervised learning maps input features to output labels using labeled examples...',
        },
        {
          source: 'ML_Fundamentals.pdf',
          page: 'Chapter 5, p.82',
          excerpt: 'Feature engineering is often the most impactful step in the ML pipeline...',
        },
        {
          source: 'Advanced_Topics.pdf',
          page: 'Section 2.1',
          excerpt: 'Cross-validation provides a more reliable estimate of model performance...',
        },
      ],
      confidence: 'high',
      follow_up_suggestions: [
        'What specific ML algorithms are covered?',
        'How does the document compare supervised vs unsupervised learning?',
        'What evaluation metrics are recommended?',
      ],
    },
    timestamp: '10:31 AM',
  },
]

const SAMPLE_STUDY_PLAN: StudyPlanResponse = {
  title: 'Machine Learning Fundamentals - 2 Week Study Plan',
  overview:
    'A comprehensive study plan covering the core concepts of machine learning, from foundational statistics to practical model building, grounded in your uploaded course materials.',
  total_duration: '2 weeks',
  difficulty_level: 'Intermediate',
  days: [
    {
      day_number: 1,
      topic: 'Introduction to Machine Learning',
      subtopics: ['History and evolution of ML', 'Types of learning: supervised, unsupervised, reinforcement', 'Key terminology and concepts'],
      learning_objectives: ['Define machine learning and its applications', 'Distinguish between types of ML approaches', 'Identify real-world ML use cases'],
      estimated_hours: 3,
      practice_tasks: ['Classify 10 real-world problems as supervised/unsupervised/reinforcement', 'Write a summary of ML history timeline'],
      resources: ['ML_Fundamentals.pdf - Chapter 1', 'Advanced_Topics.pdf - Introduction'],
    },
    {
      day_number: 2,
      topic: 'Statistics and Probability Foundations',
      subtopics: ['Descriptive statistics', 'Probability distributions', 'Bayes theorem and conditional probability'],
      learning_objectives: ['Calculate basic statistical measures', 'Apply probability concepts to ML problems', 'Understand Bayesian reasoning'],
      estimated_hours: 4,
      practice_tasks: ['Solve 5 probability problems from the textbook', 'Implement basic statistics calculations in Python'],
      resources: ['ML_Fundamentals.pdf - Chapter 2'],
    },
    {
      day_number: 3,
      topic: 'Data Preprocessing and Feature Engineering',
      subtopics: ['Data cleaning techniques', 'Feature scaling and normalization', 'Handling missing values', 'Categorical encoding'],
      learning_objectives: ['Preprocess raw data for ML models', 'Apply feature engineering techniques', 'Handle common data quality issues'],
      estimated_hours: 3.5,
      practice_tasks: ['Clean a sample dataset', 'Engineer 3 new features from existing data'],
      resources: ['ML_Fundamentals.pdf - Chapter 5'],
    },
  ],
  grounded_in_documents: true,
  tips: [
    "Review each day's material before moving to the next topic",
    'Practice coding exercises alongside theoretical reading',
    'Take notes on key formulas and concepts for quick revision',
    'Revisit difficult topics after completing the full plan',
  ],
}

const SAMPLE_QUIZ: QuizResponse = {
  quiz_title: 'Machine Learning Concepts Quiz',
  topic: 'Machine Learning Fundamentals',
  total_questions: 5,
  questions: [
    {
      question_number: 1,
      question_type: 'mcq',
      question: 'Which of the following is NOT a type of machine learning?',
      options: ['Supervised Learning', 'Unsupervised Learning', 'Deterministic Learning', 'Reinforcement Learning'],
      correct_answer: 'Deterministic Learning',
      explanation: 'The three main types of machine learning are Supervised, Unsupervised, and Reinforcement Learning. Deterministic Learning is not a recognized ML paradigm.',
      difficulty: 'easy',
    },
    {
      question_number: 2,
      question_type: 'mcq',
      question: 'What is the purpose of cross-validation in machine learning?',
      options: ['To increase training speed', 'To provide a robust estimate of model performance', 'To reduce the size of the dataset', 'To eliminate the need for a test set'],
      correct_answer: 'To provide a robust estimate of model performance',
      explanation: 'Cross-validation splits data into multiple folds, training and testing on different subsets to provide a more reliable performance estimate than a single train-test split.',
      difficulty: 'medium',
    },
    {
      question_number: 3,
      question_type: 'short_answer',
      question: 'Explain the bias-variance tradeoff in your own words.',
      options: [],
      correct_answer:
        "The bias-variance tradeoff describes the tension between a model's ability to fit training data (low bias) and its ability to generalize to new data (low variance). Complex models tend to have low bias but high variance (overfitting), while simple models have high bias but low variance (underfitting).",
      explanation: 'Understanding this tradeoff is crucial for selecting appropriate model complexity and regularization strategies.',
      difficulty: 'hard',
    },
    {
      question_number: 4,
      question_type: 'mcq',
      question: 'Which technique is used to prevent overfitting in neural networks?',
      options: ['Gradient descent', 'Dropout', 'Feature scaling', 'One-hot encoding'],
      correct_answer: 'Dropout',
      explanation: 'Dropout randomly deactivates neurons during training, forcing the network to learn redundant representations and preventing over-reliance on specific neurons.',
      difficulty: 'medium',
    },
    {
      question_number: 5,
      question_type: 'mcq',
      question: 'What does the term "feature engineering" refer to?',
      options: ['Building hardware for ML', 'Creating new input variables from raw data', 'Optimizing model architecture', 'Deploying ML models to production'],
      correct_answer: 'Creating new input variables from raw data',
      explanation: 'Feature engineering involves creating, selecting, and transforming variables (features) from raw data to improve model performance.',
      difficulty: 'easy',
    },
  ],
  grounded_in_documents: true,
}

// ============================================================================
// ERROR BOUNDARY
// ============================================================================

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold mb-2 font-serif">Something went wrong</h2>
            <p className="text-muted-foreground mb-6 text-sm leading-relaxed">{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-all duration-200 hover:opacity-90"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ============================================================================
// SIDEBAR
// ============================================================================

function Sidebar({
  activeTab,
  setActiveTab,
  docCount,
}: {
  activeTab: string
  setActiveTab: (tab: string) => void
  docCount: number
}) {
  const navItems = [
    { id: 'chat', label: 'Chat', icon: MessageSquare, desc: 'Ask questions' },
    { id: 'study', label: 'Study Plan', icon: GraduationCap, desc: 'Create plans' },
    { id: 'quiz', label: 'Quiz', icon: HelpCircle, desc: 'Test yourself' },
    { id: 'documents', label: 'Documents', icon: FolderOpen, desc: `${docCount} file${docCount !== 1 ? 's' : ''}` },
  ]

  return (
    <div className="w-[280px] min-h-screen bg-card border-r border-border/20 flex flex-col">
      {/* Logo */}
      <div className="p-6 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <BookOpen className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-serif tracking-tight text-foreground">LearnAgent</h1>
            <p className="text-[11px] text-muted-foreground tracking-wide">Intelligent Learning Assistant</p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-border/20" />

      {/* Navigation */}
      <nav className="flex-1 p-3 pt-4 space-y-0.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-2">Workspace</p>
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/15'
                  : 'text-foreground/70 hover:bg-secondary/80 hover:text-foreground'
              )}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                  isActive ? 'bg-primary-foreground/15' : 'bg-secondary group-hover:bg-secondary'
                )}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="font-medium block text-[13px] leading-tight">{item.label}</span>
                <span className={cn('text-[10px] leading-tight', isActive ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                  {item.desc}
                </span>
              </div>
            </button>
          )
        })}
      </nav>

      {/* Upload Button */}
      <div className="px-4 pb-3">
        <Dialog>
          <DialogTrigger asChild>
            <Button className="w-full gap-2" variant="outline" size="sm">
              <Upload className="w-3.5 h-3.5" />
              Upload Documents
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-serif">Upload Documents</DialogTitle>
              <DialogDescription>Upload PDF, DOCX, or TXT files to your knowledge base.</DialogDescription>
            </DialogHeader>
            <KnowledgeBaseUpload ragId={RAG_ID} onUploadSuccess={() => {}} onDeleteSuccess={() => {}} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Agent Status */}
      <div className="p-4 mx-3 mb-3 rounded-xl bg-secondary/50">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2.5">AI Agents</p>
        <div className="space-y-2">
          {AGENTS.map((agent) => {
            const Icon = agent.icon
            return (
              <div key={agent.id} className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                <Icon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-foreground/80 truncate">{agent.name}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// CHAT TAB
// ============================================================================

function ChatTab({
  useSampleData,
  setActiveAgentId,
}: {
  useSampleData: boolean
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatHistory())
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [sessionId, setSessionId] = useState(() => getOrCreateSessionId())
  const scrollRef = useRef<HTMLDivElement>(null)

  const { documents, fetchDocuments: fetchDocs } = useRAGKnowledgeBase()
  useEffect(() => {
    fetchDocs(RAG_ID)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (messages.length > 0) {
      saveChatHistory(messages)
    }
  }, [messages])

  const displayMessages = useSampleData && messages.length === 0 ? SAMPLE_CHAT : messages

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [displayMessages, loading])

  const handleClearHistory = useCallback(() => {
    setMessages([])
    clearChatHistory()
    setStatusMessage('')
    const newSessionId = resetSessionId()
    setSessionId(newSessionId)
  }, [])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return

    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setStatusMessage('')
    setActiveAgentId(DOC_QA_AGENT_ID)

    try {
      let enhancedMessage = trimmed
      const docNames = documents?.map((d) => d.fileName).filter(Boolean) || []
      if (docNames.length > 0) {
        enhancedMessage = `[AVAILABLE DOCUMENTS IN KNOWLEDGE BASE: ${docNames.join(', ')}]\n\nUser Question: ${trimmed}\n\nIMPORTANT: Only cite from documents that match what the user is asking about. If the user mentions a specific document, unit, or subject name, ONLY use content from that matching document.`
      }

      const result = await callAIAgent(enhancedMessage, DOC_QA_AGENT_ID, { session_id: sessionId })

      if (result.success) {
        const data = parseAgentResponse(result, ['answer', 'citations', 'confidence', 'follow_up_suggestions']) as unknown as DocQAResponse
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: data?.answer ?? '',
          data,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
        setMessages((prev) => [...prev, assistantMsg])
      } else {
        setStatusMessage(result?.error ?? 'Failed to get a response. Please try again.')
        const errorMsg: ChatMessage = {
          role: 'assistant',
          content: result?.response?.message ?? 'I encountered an error processing your question. Please try again.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
        setMessages((prev) => [...prev, errorMsg])
      }
    } catch {
      setStatusMessage('Network error. Please check your connection.')
    } finally {
      setLoading(false)
      setActiveAgentId(null)
    }
  }, [input, loading, sessionId, setActiveAgentId, documents])

  const handleFollowUp = (suggestion: string) => {
    setInput(suggestion)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/15 flex items-center justify-between bg-card/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold font-serif tracking-tight">Document Q&A</h2>
            <p className="text-xs text-muted-foreground">Ask questions about your uploaded documents</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {messages.length > 0 && (
            <>
              <Badge variant="secondary" className="text-[10px] font-normal">
                {messages.length} message{messages.length !== 1 ? 's' : ''}
              </Badge>
              <Button variant="ghost" size="sm" onClick={handleClearHistory} disabled={loading} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <RotateCcw className="w-3 h-3" />
                New Chat
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {displayMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-20 h-20 rounded-2xl bg-primary/8 flex items-center justify-center mb-5">
              <BookMarked className="w-9 h-9 text-primary" />
            </div>
            <h3 className="text-xl font-serif font-bold mb-2 tracking-tight">Start a Conversation</h3>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              Upload your study materials and ask any question. The AI will provide grounded answers with citations from your documents.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {['Summarize key concepts', 'Explain a topic', 'Compare two ideas'].map((hint) => (
                <button
                  key={hint}
                  onClick={() => setInput(hint)}
                  className="text-xs px-3.5 py-2 rounded-full border border-border/40 text-muted-foreground hover:border-primary/40 hover:text-primary transition-all duration-200"
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        ) : (
          displayMessages.map((msg, idx) => (
            <div key={idx} className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Brain className="w-4 h-4 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[75%] rounded-2xl px-4 py-3',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-card border border-border/25 shadow-sm rounded-bl-md'
                )}
              >
                {msg.role === 'user' ? (
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                ) : (
                  <div className="space-y-3">
                    {msg.data?.answer ? (
                      <div className="text-foreground">{renderMarkdown(msg.data.answer)}</div>
                    ) : msg.content ? (
                      <div className="text-foreground">{renderMarkdown(msg.content)}</div>
                    ) : null}

                    {msg.data?.confidence && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className={cn('text-[10px] px-2.5 py-0.5 rounded-full border font-medium', getConfidenceColor(msg.data.confidence))}>
                          {(msg.data.confidence ?? '').charAt(0).toUpperCase() + (msg.data.confidence ?? '').slice(1)} Confidence
                        </span>
                      </div>
                    )}

                    {Array.isArray(msg.data?.citations) && msg.data.citations.length > 0 && (
                      <div className="mt-3 p-3 bg-secondary/40 rounded-xl border border-border/15">
                        <p className="text-[10px] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-widest">
                          <FileText className="w-3 h-3" /> Sources
                        </p>
                        <div className="space-y-2">
                          {msg.data.citations.map((cit, ci) => (
                            <div key={ci} className="text-xs border-l-2 border-primary/30 pl-2.5 py-0.5">
                              <span className="font-medium text-foreground">{cit?.source ?? 'Unknown'}</span>
                              {cit?.page && <span className="text-muted-foreground"> -- {cit.page}</span>}
                              {cit?.excerpt && <p className="text-muted-foreground mt-0.5 italic leading-relaxed">&quot;{cit.excerpt}&quot;</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {Array.isArray(msg.data?.follow_up_suggestions) && msg.data.follow_up_suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {msg.data.follow_up_suggestions.map((sug, si) => (
                          <button
                            key={si}
                            onClick={() => handleFollowUp(sug)}
                            className="text-[11px] px-3 py-1.5 rounded-full border border-primary/25 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                          >
                            {sug}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <p className={cn('text-[10px] mt-2', msg.role === 'user' ? 'text-primary-foreground/50' : 'text-muted-foreground/60')}>
                  {msg.timestamp}
                </p>
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary-foreground">U</span>
                </div>
              )}
            </div>
          ))
        )}

        {/* Typing indicator */}
        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Brain className="w-4 h-4 text-primary" />
            </div>
            <div className="bg-card border border-border/25 shadow-sm rounded-2xl rounded-bl-md px-5 py-3.5">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '0.15s' }} />
                <div className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '0.3s' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status */}
      {statusMessage && (
        <div className="px-6 py-2">
          <p className="text-xs text-destructive flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3" /> {statusMessage}
          </p>
        </div>
      )}

      {/* Input Bar */}
      <div className="px-6 py-4 border-t border-border/15 bg-card/40">
        <div className="flex gap-2.5 items-end">
          <div className="flex-1 relative">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your documents..."
              disabled={loading}
              className="pr-4 py-5 text-sm rounded-xl border-border/30 bg-background focus-visible:ring-primary/30"
            />
          </div>
          <Button onClick={handleSend} disabled={loading || !input.trim()} size="lg" className="gap-2 rounded-xl px-5 shadow-md shadow-primary/10">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span className="hidden sm:inline">Ask</span>
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// STUDY PLAN TAB
// ============================================================================

function StudyPlanTab({
  useSampleData,
  setActiveAgentId,
}: {
  useSampleData: boolean
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
}) {
  const [topic, setTopic] = useState('')
  const [examType, setExamType] = useState('General')
  const [duration, setDuration] = useState('2 weeks')
  const [difficulty, setDifficulty] = useState('Intermediate')
  const [plan, setPlan] = useState<StudyPlanResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [checkedTasks, setCheckedTasks] = useState<Record<string, boolean>>({})

  const displayPlan = useSampleData && !plan ? SAMPLE_STUDY_PLAN : plan

  const handleGenerate = useCallback(async () => {
    if (!topic.trim() || loading) return
    setLoading(true)
    setStatusMessage('')
    setPlan(null)
    setCheckedTasks({})
    setActiveAgentId(STUDY_PLAN_AGENT_ID)

    const message = `Create a ${difficulty.toLowerCase()} level study plan for "${topic}" targeting ${examType} exam preparation. Duration: ${duration}. Please include day-by-day breakdowns with subtopics, learning objectives, practice tasks, and resources.`

    try {
      const result = await callAIAgent(message, STUDY_PLAN_AGENT_ID)
      if (result.success) {
        const data = parseAgentResponse(result, ['title', 'overview', 'days', 'total_duration', 'tips']) as unknown as StudyPlanResponse
        setPlan(data)
      } else {
        setStatusMessage(result?.error ?? 'Failed to generate study plan.')
      }
    } catch {
      setStatusMessage('Network error. Please try again.')
    } finally {
      setLoading(false)
      setActiveAgentId(null)
    }
  }, [topic, examType, duration, difficulty, loading, setActiveAgentId])

  const toggleTask = (taskKey: string) => {
    setCheckedTasks((prev) => ({ ...prev, [taskKey]: !prev[taskKey] }))
  }

  // Compute progress for checked tasks
  const totalTasks = Array.isArray(displayPlan?.days)
    ? displayPlan.days.reduce((acc, day, dayIdx) => {
        const tasks = Array.isArray(day?.practice_tasks) ? day.practice_tasks.length : 0
        return acc + tasks
      }, 0)
    : 0
  const completedTasks = Object.values(checkedTasks).filter(Boolean).length
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/15 flex items-center gap-3 bg-card/40">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <GraduationCap className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-serif tracking-tight">Study Plan Generator</h2>
          <p className="text-xs text-muted-foreground">Create a personalized study plan from your documents</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Input Form */}
        <Card className="border-border/20 shadow-sm">
          <CardContent className="pt-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="study-topic" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Topic *
                </Label>
                <Input
                  id="study-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., Machine Learning Fundamentals"
                  className="mt-1.5 border-border/30"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Exam Type</Label>
                <Select value={examType} onValueChange={setExamType}>
                  <SelectTrigger className="mt-1.5 border-border/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['General', 'UPSC', 'GRE', 'GMAT', 'SAT', 'Custom'].map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Duration</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger className="mt-1.5 border-border/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['1 week', '2 weeks', '1 month', '3 months'].map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Difficulty</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger className="mt-1.5 border-border/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['Beginner', 'Intermediate', 'Advanced'].map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={handleGenerate} disabled={loading || !topic.trim()} className="w-full gap-2 shadow-md shadow-primary/10">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate Study Plan
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status */}
        {statusMessage && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 p-3 rounded-lg border border-destructive/15">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {statusMessage}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="bg-muted rounded-xl h-36 w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Study Plan Display */}
        {!loading && displayPlan && (
          <div className="space-y-5">
            {/* Title & Overview */}
            <Card className="border-border/20 shadow-sm overflow-hidden">
              <div className="h-1.5 bg-primary" />
              <CardContent className="pt-5">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold font-serif tracking-tight leading-snug">{displayPlan?.title ?? 'Study Plan'}</h3>
                    {displayPlan?.overview && <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-2xl">{displayPlan.overview}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 flex-shrink-0">
                    {displayPlan?.total_duration && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Clock className="w-3 h-3" /> {displayPlan.total_duration}
                      </Badge>
                    )}
                    {displayPlan?.difficulty_level && (
                      <span className={cn('text-xs px-2.5 py-1 rounded-full border font-medium', getDifficultyColor(displayPlan.difficulty_level))}>
                        {displayPlan.difficulty_level}
                      </span>
                    )}
                    {displayPlan?.grounded_in_documents && (
                      <Badge variant="outline" className="gap-1 border-green-300 text-green-700 text-xs">
                        <CheckCircle2 className="w-3 h-3" /> Grounded
                      </Badge>
                    )}
                  </div>
                </div>
                {/* Task progress */}
                {totalTasks > 0 && (
                  <div className="mt-4 pt-4 border-t border-border/15">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        Task Progress: {completedTasks} / {totalTasks}
                      </span>
                      <span className="text-xs font-semibold text-primary">{progressPercent}%</span>
                    </div>
                    <Progress value={progressPercent} className="h-2" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Day Timeline Cards */}
            {Array.isArray(displayPlan?.days) &&
              displayPlan.days.map((day, dayIdx) => (
                <div key={dayIdx} className="flex gap-4">
                  {/* Timeline dot & line */}
                  <div className="flex flex-col items-center pt-1">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-md shadow-primary/15">
                      {day?.day_number ?? dayIdx + 1}
                    </div>
                    {dayIdx < (displayPlan?.days?.length ?? 0) - 1 && <div className="w-0.5 flex-1 bg-border/30 mt-2" />}
                  </div>

                  {/* Day Card */}
                  <Card className="flex-1 border-border/20 shadow-sm mb-1">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base font-serif tracking-tight">{day?.topic ?? 'Topic'}</CardTitle>
                        {(day?.estimated_hours ?? 0) > 0 && (
                          <Badge variant="secondary" className="gap-1 text-[10px] flex-shrink-0">
                            <Clock className="w-2.5 h-2.5" /> {day?.estimated_hours}h
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-0">
                      {/* Subtopics */}
                      {Array.isArray(day?.subtopics) && day.subtopics.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Subtopics</p>
                          <div className="flex flex-wrap gap-1.5">
                            {day.subtopics.map((st, si) => (
                              <span key={si} className="text-xs px-2.5 py-1 rounded-full bg-secondary/70 text-secondary-foreground">
                                {st}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Learning Objectives */}
                      {Array.isArray(day?.learning_objectives) && day.learning_objectives.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 flex items-center gap-1">
                            <Target className="w-3 h-3" /> Learning Objectives
                          </p>
                          <ul className="space-y-1">
                            {day.learning_objectives.map((obj, oi) => (
                              <li key={oi} className="text-sm flex items-start gap-2 leading-relaxed text-foreground/85">
                                <CircleDot className="w-3 h-3 mt-1 text-primary/60 flex-shrink-0" />
                                {obj}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Practice Tasks */}
                      {Array.isArray(day?.practice_tasks) && day.practice_tasks.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 flex items-center gap-1">
                            <ListChecks className="w-3 h-3" /> Practice Tasks
                          </p>
                          <ul className="space-y-1.5">
                            {day.practice_tasks.map((task, ti) => {
                              const taskKey = `${dayIdx}-${ti}`
                              return (
                                <li key={ti} className="text-sm flex items-start gap-2.5">
                                  <button
                                    onClick={() => toggleTask(taskKey)}
                                    className={cn(
                                      'w-[18px] h-[18px] rounded border flex-shrink-0 mt-0.5 flex items-center justify-center transition-all duration-200',
                                      checkedTasks[taskKey] ? 'bg-primary border-primary text-primary-foreground' : 'border-input hover:border-primary/60'
                                    )}
                                  >
                                    {checkedTasks[taskKey] && <Check className="w-3 h-3" />}
                                  </button>
                                  <span className={cn('leading-relaxed', checkedTasks[taskKey] && 'line-through text-muted-foreground')}>{task}</span>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )}

                      {/* Resources */}
                      {Array.isArray(day?.resources) && day.resources.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 flex items-center gap-1">
                            <BookOpen className="w-3 h-3" /> Resources
                          </p>
                          <ul className="space-y-1">
                            {day.resources.map((res, ri) => (
                              <li key={ri} className="text-sm flex items-start gap-2 text-muted-foreground leading-relaxed">
                                <FileText className="w-3 h-3 mt-1 flex-shrink-0" />
                                {res}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ))}

            {/* Tips */}
            {Array.isArray(displayPlan?.tips) && displayPlan.tips.length > 0 && (
              <Card className="border-border/20 shadow-sm bg-secondary/20">
                <CardContent className="pt-5">
                  <p className="text-sm font-semibold flex items-center gap-2 mb-3 font-serif">
                    <Lightbulb className="w-4 h-4 text-accent" /> Study Tips
                  </p>
                  <ul className="space-y-2">
                    {displayPlan.tips.map((tip, ti) => (
                      <li key={ti} className="text-sm flex items-start gap-2.5 leading-relaxed text-foreground/85">
                        <Star className="w-3 h-3 mt-1 text-accent flex-shrink-0" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Empty State */}
        {!loading && !displayPlan && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-2xl bg-primary/8 flex items-center justify-center mb-5">
              <GraduationCap className="w-9 h-9 text-primary" />
            </div>
            <h3 className="text-xl font-serif font-bold mb-2 tracking-tight">Create Your Study Plan</h3>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              Enter a topic and customize your preferences. The AI will generate a structured day-by-day study plan grounded in your uploaded documents.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// QUIZ TAB
// ============================================================================

function QuizTab({
  useSampleData,
  setActiveAgentId,
}: {
  useSampleData: boolean
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
}) {
  const [quizState, setQuizState] = useState<'input' | 'taking' | 'results'>('input')
  const [topic, setTopic] = useState('')
  const [quizType, setQuizType] = useState('Mixed')
  const [questionCount, setQuestionCount] = useState(10)
  const [quiz, setQuiz] = useState<QuizResponse | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState('')
  const [shortAnswer, setShortAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  const displayQuiz = useSampleData && !quiz ? SAMPLE_QUIZ : quiz
  const questions = Array.isArray(displayQuiz?.questions) ? displayQuiz.questions : []

  const handleGenerate = useCallback(async () => {
    if (!topic.trim() || loading) return
    setLoading(true)
    setStatusMessage('')
    setQuiz(null)
    setUserAnswers({})
    setCurrentQuestion(0)
    setActiveAgentId(QUIZ_AGENT_ID)

    const message = `Generate a quiz on "${topic}" with ${questionCount} questions. Quiz type: ${quizType} (include MCQ and/or short answer questions). Vary difficulty levels (easy, medium, hard).`

    try {
      const result = await callAIAgent(message, QUIZ_AGENT_ID)
      if (result.success) {
        const data = parseAgentResponse(result, ['quiz_title', 'questions', 'total_questions', 'topic']) as unknown as QuizResponse
        setQuiz(data)
        setQuizState('taking')
      } else {
        setStatusMessage(result?.error ?? 'Failed to generate quiz.')
      }
    } catch {
      setStatusMessage('Network error. Please try again.')
    } finally {
      setLoading(false)
      setActiveAgentId(null)
    }
  }, [topic, quizType, questionCount, loading, setActiveAgentId])

  const currentQ = questions[currentQuestion]
  const isMCQ =
    currentQ?.question_type?.toLowerCase()?.includes('mcq') ||
    (Array.isArray(currentQ?.options) && currentQ.options.length > 0 && currentQ?.question_type !== 'short_answer')

  const handleSubmitAnswer = () => {
    const answer = isMCQ ? selectedAnswer : shortAnswer
    if (!answer.trim()) return
    setUserAnswers((prev) => ({ ...prev, [currentQuestion]: answer }))
    setSubmitted(true)
  }

  const handleNextQuestion = () => {
    setSubmitted(false)
    setSelectedAnswer('')
    setShortAnswer('')
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion((prev) => prev + 1)
    } else {
      setQuizState('results')
    }
  }

  const handleRetake = () => {
    setQuizState('taking')
    setCurrentQuestion(0)
    setUserAnswers({})
    setSubmitted(false)
    setSelectedAnswer('')
    setShortAnswer('')
  }

  const handleNewQuiz = () => {
    setQuizState('input')
    setQuiz(null)
    setCurrentQuestion(0)
    setUserAnswers({})
    setSubmitted(false)
    setSelectedAnswer('')
    setShortAnswer('')
    setTopic('')
  }

  const handleStartSample = () => {
    if (useSampleData && !quiz) {
      setQuizState('taking')
    }
  }

  // Score calculation
  const totalAnswered = Object.keys(userAnswers).length
  const correctCount = Object.entries(userAnswers).reduce((acc, [qIdx, ans]) => {
    const q = questions[parseInt(qIdx)]
    if (!q) return acc
    const correct = (q.correct_answer ?? '').toLowerCase().trim()
    const user = (ans ?? '').toLowerCase().trim()
    return acc + (correct === user || correct.includes(user) || user.includes(correct) ? 1 : 0)
  }, 0)
  const scorePercent = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0

  const getScoreLabel = (pct: number) => {
    if (pct >= 90) return 'Excellent!'
    if (pct >= 70) return 'Great job!'
    if (pct >= 50) return 'Good effort!'
    return 'Keep practicing!'
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/15 flex items-center justify-between bg-card/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <HelpCircle className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold font-serif tracking-tight">Quiz Generator</h2>
            <p className="text-xs text-muted-foreground">Test your knowledge with AI-generated quizzes</p>
          </div>
        </div>
        {quizState !== 'input' && (
          <Button variant="ghost" size="sm" onClick={handleNewQuiz} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <RotateCcw className="w-3 h-3" />
            New Quiz
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* ====== INPUT STATE ====== */}
        {quizState === 'input' && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <Card className="border-border/20 shadow-sm">
              <CardContent className="pt-5 space-y-5">
                <div>
                  <Label htmlFor="quiz-topic" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Topic *
                  </Label>
                  <Input
                    id="quiz-topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., Machine Learning Basics"
                    className="mt-1.5 border-border/30"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Quiz Type</Label>
                  <div className="flex gap-2">
                    {['MCQ', 'Short Answer', 'Mixed'].map((t) => (
                      <Button key={t} variant={quizType === t ? 'default' : 'outline'} size="sm" onClick={() => setQuizType(t)} className="flex-1 text-xs">
                        {t}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                    Questions: {questionCount}
                  </Label>
                  <div className="flex gap-2">
                    {[5, 10, 15, 20].map((n) => (
                      <Button
                        key={n}
                        variant={questionCount === n ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setQuestionCount(n)}
                        className="flex-1 text-xs"
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button onClick={handleGenerate} disabled={loading || !topic.trim()} className="w-full gap-2 shadow-md shadow-primary/10">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                  Generate Quiz
                </Button>
              </CardContent>
            </Card>

            {statusMessage && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 p-3 rounded-lg border border-destructive/15">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {statusMessage}
              </div>
            )}

            {loading && (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="bg-muted rounded-xl h-28 w-full" />
                  </div>
                ))}
              </div>
            )}

            {/* Sample Preview */}
            {useSampleData && !quiz && !loading && (
              <Card className="border-border/20 shadow-sm overflow-hidden">
                <div className="h-1 bg-primary" />
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="font-serif text-base">{SAMPLE_QUIZ?.quiz_title ?? 'Sample Quiz'}</CardTitle>
                      <CardDescription className="mt-0.5 text-xs">
                        {SAMPLE_QUIZ?.topic ?? ''} -- {SAMPLE_QUIZ?.total_questions ?? 0} questions
                      </CardDescription>
                    </div>
                    {SAMPLE_QUIZ?.grounded_in_documents && (
                      <Badge variant="outline" className="gap-1 border-green-300 text-green-700 text-xs">
                        <CheckCircle2 className="w-3 h-3" /> Grounded
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardFooter className="pt-0">
                  <Button onClick={handleStartSample} className="gap-2 shadow-md shadow-primary/10">
                    <ArrowRight className="w-4 h-4" /> Start Sample Quiz
                  </Button>
                </CardFooter>
              </Card>
            )}

            {/* Empty State */}
            {!useSampleData && !loading && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-20 h-20 rounded-2xl bg-primary/8 flex items-center justify-center mb-5">
                  <HelpCircle className="w-9 h-9 text-primary" />
                </div>
                <h3 className="text-xl font-serif font-bold mb-2 tracking-tight">Create a Quiz</h3>
                <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                  Choose a topic and quiz preferences. The AI will generate questions grounded in your uploaded documents.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ====== TAKING STATE ====== */}
        {quizState === 'taking' && questions.length > 0 && currentQ && (
          <div className="space-y-5 max-w-2xl mx-auto">
            {/* Progress Header */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Question {currentQuestion + 1} of {questions.length}
                </span>
                {currentQ?.difficulty && (
                  <span className={cn('text-[10px] px-2.5 py-0.5 rounded-full border font-medium', getDifficultyColor(currentQ.difficulty))}>
                    {currentQ.difficulty}
                  </span>
                )}
              </div>
              <Progress value={((currentQuestion + 1) / questions.length) * 100} className="h-2" />
            </div>

            {/* Question Card */}
            <Card className="border-border/20 shadow-sm">
              <CardContent className="pt-6 space-y-5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-primary">{(currentQ?.question_number ?? currentQuestion + 1)}</span>
                  </div>
                  <p className="text-[15px] font-medium leading-relaxed flex-1">{currentQ?.question ?? ''}</p>
                </div>

                {/* MCQ Options */}
                {isMCQ && Array.isArray(currentQ?.options) && currentQ.options.length > 0 && (
                  <div className="space-y-2 pl-11">
                    {currentQ.options.map((opt, oi) => {
                      const letter = String.fromCharCode(65 + oi)
                      const isSelected = selectedAnswer === opt
                      const isCorrect = submitted && (opt ?? '').toLowerCase() === (currentQ?.correct_answer ?? '').toLowerCase()
                      const isWrong = submitted && isSelected && !isCorrect

                      return (
                        <button
                          key={oi}
                          onClick={() => !submitted && setSelectedAnswer(opt ?? '')}
                          disabled={submitted}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left text-sm transition-all duration-200',
                            !submitted && isSelected && 'border-primary bg-primary/5 shadow-sm',
                            !submitted && !isSelected && 'border-border/30 hover:border-primary/40 hover:bg-secondary/30',
                            isCorrect && 'border-green-500 bg-green-50 shadow-sm',
                            isWrong && 'border-red-500 bg-red-50 shadow-sm',
                            submitted && !isCorrect && !isWrong && 'opacity-40'
                          )}
                        >
                          <span
                            className={cn(
                              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border transition-colors',
                              !submitted && isSelected && 'bg-primary text-primary-foreground border-primary',
                              !submitted && !isSelected && 'bg-secondary/50 border-border/30',
                              isCorrect && 'bg-green-500 text-white border-green-500',
                              isWrong && 'bg-red-500 text-white border-red-500'
                            )}
                          >
                            {submitted && isCorrect ? <Check className="w-3.5 h-3.5" /> : submitted && isWrong ? <X className="w-3.5 h-3.5" /> : letter}
                          </span>
                          <span className="leading-relaxed">{opt}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Short Answer */}
                {!isMCQ && (
                  <div className="pl-11">
                    <Textarea
                      value={shortAnswer}
                      onChange={(e) => setShortAnswer(e.target.value)}
                      placeholder="Type your answer here..."
                      rows={4}
                      disabled={submitted}
                      className="border-border/30"
                    />
                  </div>
                )}

                {/* Submit / Feedback */}
                <div className="pl-11">
                  {!submitted ? (
                    <Button onClick={handleSubmitAnswer} disabled={isMCQ ? !selectedAnswer : !shortAnswer.trim()} className="w-full gap-2 shadow-md shadow-primary/10">
                      <CheckCircle2 className="w-4 h-4" /> Submit Answer
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3.5 bg-secondary/40 rounded-xl border border-border/15">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Correct Answer</p>
                        <p className="text-sm font-medium text-foreground">{currentQ?.correct_answer ?? ''}</p>
                      </div>

                      {currentQ?.explanation && (
                        <div className="p-3.5 bg-secondary/40 rounded-xl border border-border/15">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-1">
                            <Lightbulb className="w-3 h-3 text-accent" /> Explanation
                          </p>
                          <p className="text-sm leading-relaxed text-foreground/85">{currentQ.explanation}</p>
                        </div>
                      )}

                      <Button onClick={handleNextQuestion} className="w-full gap-2 shadow-md shadow-primary/10">
                        {currentQuestion < questions.length - 1 ? (
                          <>
                            <ArrowRight className="w-4 h-4" /> Next Question
                          </>
                        ) : (
                          <>
                            <Trophy className="w-4 h-4" /> View Results
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ====== RESULTS STATE ====== */}
        {quizState === 'results' && (
          <div className="space-y-6 max-w-2xl mx-auto">
            {/* Score */}
            <Card className="border-border/20 shadow-sm overflow-hidden">
              <div className="h-1.5 bg-primary" />
              <CardContent className="pt-8 pb-8 text-center">
                <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
                  <Trophy className="w-12 h-12 text-primary" />
                </div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{getScoreLabel(scorePercent)}</p>
                <h3 className="text-3xl font-bold font-serif tracking-tight">
                  {correctCount} / {totalAnswered}
                </h3>
                <p className="text-muted-foreground text-sm mt-1">Questions answered correctly</p>
                <div className="mt-5 max-w-xs mx-auto">
                  <Progress value={scorePercent} className="h-3" />
                  <p className="text-xl font-bold mt-2 text-primary">{scorePercent}%</p>
                </div>
                <div className="flex gap-3 justify-center mt-7">
                  <Button variant="outline" onClick={handleRetake} className="gap-1.5">
                    <RotateCcw className="w-4 h-4" /> Retake
                  </Button>
                  <Button onClick={handleNewQuiz} className="gap-1.5 shadow-md shadow-primary/10">
                    <Brain className="w-4 h-4" /> New Quiz
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Review */}
            <Card className="border-border/20 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-serif">Question Review</CardTitle>
                <CardDescription className="text-xs">Review your answers and learn from the explanations</CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {questions.map((q, qi) => {
                    const userAns = userAnswers[qi] ?? ''
                    const correct = (q?.correct_answer ?? '').toLowerCase().trim()
                    const user = userAns.toLowerCase().trim()
                    const isCorrect = correct === user || correct.includes(user) || user.includes(correct)

                    return (
                      <AccordionItem key={qi} value={`q-${qi}`}>
                        <AccordionTrigger className="text-sm hover:no-underline">
                          <div className="flex items-center gap-2.5 text-left">
                            {isCorrect ? (
                              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                            )}
                            <span className="line-clamp-1">
                              Q{q?.question_number ?? qi + 1}: {q?.question ?? ''}
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 pl-7 text-sm">
                            <div>
                              <span className="text-muted-foreground">Your answer: </span>
                              <span className={cn('font-medium', isCorrect ? 'text-green-700' : 'text-red-600')}>{userAns || 'Not answered'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Correct answer: </span>
                              <span className="font-medium text-green-700">{q?.correct_answer ?? ''}</span>
                            </div>
                            {q?.explanation && (
                              <div className="p-2.5 bg-secondary/40 rounded-lg text-muted-foreground mt-1.5 text-xs leading-relaxed">{q.explanation}</div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )
                  })}
                </Accordion>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// DOCUMENTS TAB
// ============================================================================

function DocumentsTab({ onDocCountChange }: { onDocCountChange: (count: number) => void }) {
  const { documents, loading, error, fetchDocuments } = useRAGKnowledgeBase()
  const [refreshing, setRefreshing] = useState(false)
  const [showUploadDialog, setShowUploadDialog] = useState(false)

  useEffect(() => {
    fetchDocuments(RAG_ID)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    onDocCountChange(Array.isArray(documents) ? documents.length : 0)
  }, [documents, onDocCountChange])

  const refreshWithRetries = useCallback(async () => {
    setRefreshing(true)
    await fetchDocuments(RAG_ID)
    setTimeout(async () => {
      await fetchDocuments(RAG_ID)
    }, 2000)
    setTimeout(async () => {
      await fetchDocuments(RAG_ID)
      setRefreshing(false)
    }, 5000)
  }, [fetchDocuments])

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchDocuments(RAG_ID)
    setRefreshing(false)
  }, [fetchDocuments])

  const getFileTypeLabel = (fileType: string) => {
    switch (fileType) {
      case 'pdf':
        return 'PDF'
      case 'docx':
        return 'DOCX'
      case 'txt':
        return 'TXT'
      default:
        return 'FILE'
    }
  }

  const getFileTypeBg = (fileType: string) => {
    switch (fileType) {
      case 'pdf':
        return 'bg-red-100 text-red-700'
      case 'docx':
        return 'bg-blue-100 text-blue-700'
      case 'txt':
        return 'bg-gray-100 text-gray-700'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/15 flex items-center justify-between bg-card/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <FolderOpen className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold font-serif tracking-tight">Document Library</h2>
            <p className="text-xs text-muted-foreground">Manage your knowledge base documents</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleManualRefresh} disabled={loading || refreshing} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <RotateCcw className={cn('w-3 h-3', (loading || refreshing) && 'animate-spin')} />
            Refresh
          </Button>
          <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 text-xs shadow-md shadow-primary/10">
                <Upload className="w-3 h-3" />
                Upload
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-serif">Upload Documents</DialogTitle>
                <DialogDescription>Upload PDF, DOCX, or TXT files to your knowledge base for AI analysis.</DialogDescription>
              </DialogHeader>
              <KnowledgeBaseUpload
                ragId={RAG_ID}
                onUploadSuccess={() => {
                  refreshWithRetries()
                  setShowUploadDialog(false)
                }}
                onDeleteSuccess={() => {
                  refreshWithRetries()
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Inline Upload */}
        <KnowledgeBaseUpload
          ragId={RAG_ID}
          onUploadSuccess={() => {
            refreshWithRetries()
          }}
          onDeleteSuccess={() => {
            refreshWithRetries()
          }}
        />

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 p-3 rounded-lg border border-destructive/15">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {/* Loading skeletons */}
        {loading && !documents && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="bg-muted rounded-xl h-28" />
              </div>
            ))}
          </div>
        )}

        {/* Documents Grid */}
        {Array.isArray(documents) && documents.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                {documents.length} Document{documents.length !== 1 ? 's' : ''} in Library
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {documents.map((doc: RAGDocument) => (
                <Card
                  key={doc.fileName}
                  className="border-border/20 shadow-sm hover:shadow-md transition-all duration-200 hover:border-border/40"
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 tracking-wider',
                          getFileTypeBg(doc.fileType)
                        )}
                      >
                        {getFileTypeLabel(doc.fileType)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate leading-snug">{doc.fileName}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {doc?.status && (
                            <Badge variant={doc.status === 'active' ? 'default' : 'secondary'} className="text-[9px] h-5 font-normal">
                              {doc.status === 'active' ? <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> : null}
                              {doc.status}
                            </Badge>
                          )}
                          {(doc?.documentCount ?? 0) > 0 && <span className="text-[10px] text-muted-foreground">{doc.documentCount} chunks</span>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {Array.isArray(documents) && documents.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-2xl bg-primary/8 flex items-center justify-center mb-5">
              <FolderOpen className="w-9 h-9 text-primary" />
            </div>
            <h3 className="text-xl font-serif font-bold mb-2 tracking-tight">No Documents Yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              Upload your first document to get started. The AI will use your documents to answer questions, create study plans, and generate quizzes.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function Page() {
  const [activeTab, setActiveTab] = useState('chat')
  const [useSampleData, setUseSampleData] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [docCount, setDocCount] = useState(0)

  const handleDocCountChange = useCallback((count: number) => {
    setDocCount(count)
  }, [])

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground flex">
        {/* Sidebar */}
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} docCount={docCount} />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
          {/* Top Bar */}
          <div className="flex items-center justify-between px-6 py-2.5 border-b border-border/15 bg-card/30">
            <div className="flex items-center gap-2 min-w-0">
              {activeAgentId ? (
                <div className="flex items-center gap-2 text-xs text-primary bg-primary/5 px-3 py-1.5 rounded-full border border-primary/15">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="font-medium">{AGENTS.find((a) => a.id === activeAgentId)?.name ?? 'Agent'} is working...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Ready</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <Label htmlFor="sample-toggle" className="text-[11px] text-muted-foreground cursor-pointer select-none">
                Sample Data
              </Label>
              <Switch id="sample-toggle" checked={useSampleData} onCheckedChange={setUseSampleData} />
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'chat' && <ChatTab useSampleData={useSampleData} activeAgentId={activeAgentId} setActiveAgentId={setActiveAgentId} />}
            {activeTab === 'study' && <StudyPlanTab useSampleData={useSampleData} activeAgentId={activeAgentId} setActiveAgentId={setActiveAgentId} />}
            {activeTab === 'quiz' && <QuizTab useSampleData={useSampleData} activeAgentId={activeAgentId} setActiveAgentId={setActiveAgentId} />}
            {activeTab === 'documents' && <DocumentsTab onDocCountChange={handleDocCountChange} />}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
