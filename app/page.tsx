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
// Tabs available if needed
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
// ScrollArea and Separator available if needed
// import { ScrollArea } from '@/components/ui/scroll-area'
// import { Separator } from '@/components/ui/separator'
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

// ─── Constants ───────────────────────────────────────────────────────────────

const DOC_QA_AGENT_ID = '699da2284d9b8b973a73e350'
const STUDY_PLAN_AGENT_ID = '699da2297c54a9ee105c1693'
const QUIZ_AGENT_ID = '699da2294d9b8b973a73e352'
const RAG_ID = '699da1fab45a5c2df18f0f4a'

const AGENTS = [
  { id: DOC_QA_AGENT_ID, name: 'Document Q&A', purpose: 'Answer questions from your uploaded documents with citations' },
  { id: STUDY_PLAN_AGENT_ID, name: 'Study Plan Generator', purpose: 'Create structured multi-day study plans from your materials' },
  { id: QUIZ_AGENT_ID, name: 'Quiz Generator', purpose: 'Generate adaptive quizzes grounded in your uploaded content' },
]

// ─── TypeScript Interfaces ───────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseAgentResponse(result: AIAgentResponse, fields: string[]): Record<string, any> {
  let data = result?.response?.result
  if (typeof data === 'string') {
    try { data = JSON.parse(data) } catch { /* keep as string */ }
  }
  if (data && typeof data === 'object') {
    const hasFields = fields.some(f => f in data)
    if (hasFields) return data
  }
  const unwrapKeys = ['result', 'response', 'data', 'output', 'content']
  let current = data
  for (let i = 0; i < 3; i++) {
    if (!current || typeof current !== 'object') break
    for (const key of unwrapKeys) {
      if (current[key] && typeof current[key] === 'object') {
        const candidate = current[key]
        if (fields.some(f => f in candidate)) return candidate
      }
    }
    for (const key of unwrapKeys) {
      if (current[key] && typeof current[key] === 'object') {
        current = current[key]
        break
      }
    }
  }
  return data || {}
}

function formatInline(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">{part}</strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  )
}

function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return <h4 key={i} className="font-semibold text-sm mt-3 mb-1 font-serif">{line.slice(4)}</h4>
        if (line.startsWith('## '))
          return <h3 key={i} className="font-semibold text-base mt-3 mb-1 font-serif">{line.slice(3)}</h3>
        if (line.startsWith('# '))
          return <h2 key={i} className="font-bold text-lg mt-4 mb-2 font-serif">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* '))
          return <li key={i} className="ml-4 list-disc text-sm leading-relaxed">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line))
          return <li key={i} className="ml-4 list-decimal text-sm leading-relaxed">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm leading-relaxed">{formatInline(line)}</p>
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

// ─── Sample Data ─────────────────────────────────────────────────────────────

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
      answer: '## Key Principles of Machine Learning\n\nBased on your uploaded documents, the main principles discussed include:\n\n### 1. Supervised Learning\nThe document covers **supervised learning** extensively, describing how models learn from labeled training data to make predictions on new, unseen data.\n\n### 2. Feature Engineering\nA significant section focuses on **feature engineering** -- the process of selecting, transforming, and creating input variables that best represent the underlying problem.\n\n### 3. Model Evaluation\nThe materials emphasize proper **model evaluation** using techniques like cross-validation, precision-recall metrics, and confusion matrices.\n\n- Always split data into training and test sets\n- Use k-fold cross-validation for robust estimates\n- Monitor for overfitting by comparing training vs validation loss',
      citations: [
        { source: 'ML_Fundamentals.pdf', page: 'Chapter 3, p.45', excerpt: 'Supervised learning maps input features to output labels using labeled examples...' },
        { source: 'ML_Fundamentals.pdf', page: 'Chapter 5, p.82', excerpt: 'Feature engineering is often the most impactful step in the ML pipeline...' },
        { source: 'Advanced_Topics.pdf', page: 'Section 2.1', excerpt: 'Cross-validation provides a more reliable estimate of model performance...' },
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
  overview: 'A comprehensive study plan covering the core concepts of machine learning, from foundational statistics to practical model building, grounded in your uploaded course materials.',
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
    'Review each day\'s material before moving to the next topic',
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
      correct_answer: 'The bias-variance tradeoff describes the tension between a model\'s ability to fit training data (low bias) and its ability to generalize to new data (low variance). Complex models tend to have low bias but high variance (overfitting), while simple models have high bias but low variance (underfitting).',
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

// ─── ErrorBoundary ───────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
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
            <h2 className="text-xl font-semibold mb-2 font-serif">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
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

// ─── Sidebar Component ──────────────────────────────────────────────────────

function Sidebar({
  activeTab,
  setActiveTab,
  showUploadDialog,
  setShowUploadDialog,
}: {
  activeTab: string
  setActiveTab: (tab: string) => void
  showUploadDialog: boolean
  setShowUploadDialog: (open: boolean) => void
}) {
  const navItems = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'study', label: 'Study Plan', icon: GraduationCap },
    { id: 'quiz', label: 'Quiz', icon: HelpCircle },
    { id: 'documents', label: 'Documents', icon: FolderOpen },
  ]

  return (
    <div className="w-[280px] min-h-screen bg-card border-r border-border/30 flex flex-col">
      {/* Branding */}
      <div className="p-6 border-b border-border/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-serif tracking-wide text-foreground">LearnAgent</h1>
            <p className="text-xs text-muted-foreground tracking-wide">Intelligent Learning Assistant</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Upload Button */}
      <div className="p-4 border-t border-border/20">
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogTrigger asChild>
            <Button className="w-full gap-2" variant="outline">
              <Upload className="w-4 h-4" />
              Upload Documents
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-serif">Upload Documents</DialogTitle>
              <DialogDescription>Upload PDF, DOCX, or TXT files to your knowledge base.</DialogDescription>
            </DialogHeader>
            <KnowledgeBaseUpload
              ragId={RAG_ID}
              onUploadSuccess={() => {}}
              onDeleteSuccess={() => {}}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Agent Status */}
      <div className="p-4 border-t border-border/20">
        <p className="text-xs font-medium text-muted-foreground mb-2 tracking-wide uppercase">Powered by</p>
        <div className="space-y-1.5">
          {AGENTS.map((agent) => (
            <div key={agent.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
              <span className="truncate">{agent.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Chat Tab ────────────────────────────────────────────────────────────────

function ChatTab({
  useSampleData,
  activeAgentId,
  setActiveAgentId,
}: {
  useSampleData: boolean
  activeAgentId: string | null
  setActiveAgentId: (id: string | null) => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [sessionId] = useState(() => typeof window !== 'undefined' ? crypto.randomUUID() : 'default')
  const scrollRef = useRef<HTMLDivElement>(null)

  const displayMessages = useSampleData && messages.length === 0 ? SAMPLE_CHAT : messages

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [displayMessages])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return

    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setStatusMessage('')
    setActiveAgentId(DOC_QA_AGENT_ID)

    try {
      const result = await callAIAgent(trimmed, DOC_QA_AGENT_ID, { session_id: sessionId })

      if (result.success) {
        const data = parseAgentResponse(result, ['answer', 'citations', 'confidence', 'follow_up_suggestions']) as DocQAResponse
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: data?.answer ?? '',
          data,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
        setMessages(prev => [...prev, assistantMsg])
      } else {
        setStatusMessage(result?.error ?? 'Failed to get a response. Please try again.')
        const errorMsg: ChatMessage = {
          role: 'assistant',
          content: result?.response?.message ?? 'I encountered an error processing your question. Please try again.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
        setMessages(prev => [...prev, errorMsg])
      }
    } catch {
      setStatusMessage('Network error. Please check your connection.')
    } finally {
      setLoading(false)
      setActiveAgentId(null)
    }
  }, [input, loading, sessionId, setActiveAgentId])

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
      <div className="px-6 py-4 border-b border-border/20">
        <h2 className="text-xl font-bold font-serif tracking-wide">Document Q&A</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Ask questions about your uploaded documents</p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {displayMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
              <BookMarked className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-serif font-semibold mb-2">Start a Conversation</h3>
            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
              Upload your documents and ask questions. The AI will provide grounded answers with citations from your materials.
            </p>
          </div>
        ) : (
          displayMessages.map((msg, idx) => (
            <div key={idx} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[80%] rounded-xl px-4 py-3', msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border/30')}>
                {msg.role === 'user' ? (
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                ) : (
                  <div className="space-y-3">
                    {/* Answer */}
                    {msg.data?.answer ? (
                      <div className="text-foreground">{renderMarkdown(msg.data.answer)}</div>
                    ) : msg.content ? (
                      <div className="text-foreground">{renderMarkdown(msg.content)}</div>
                    ) : null}

                    {/* Confidence Badge */}
                    {msg.data?.confidence && (
                      <div className="flex items-center gap-2">
                        <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', getConfidenceColor(msg.data.confidence))}>
                          {(msg.data.confidence ?? '').charAt(0).toUpperCase() + (msg.data.confidence ?? '').slice(1)} Confidence
                        </span>
                      </div>
                    )}

                    {/* Citations */}
                    {Array.isArray(msg.data?.citations) && msg.data.citations.length > 0 && (
                      <div className="mt-2 p-3 bg-secondary/50 rounded-lg border border-border/20">
                        <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                          <FileText className="w-3 h-3" /> Referenced Sources
                        </p>
                        <div className="space-y-2">
                          {msg.data.citations.map((cit, ci) => (
                            <div key={ci} className="text-xs border-l-2 border-primary/40 pl-2">
                              <span className="font-medium">{cit?.source ?? 'Unknown'}</span>
                              {cit?.page && <span className="text-muted-foreground"> -- {cit.page}</span>}
                              {cit?.excerpt && (
                                <p className="text-muted-foreground mt-0.5 italic">&#34;{cit.excerpt}&#34;</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Follow-up Suggestions */}
                    {Array.isArray(msg.data?.follow_up_suggestions) && msg.data.follow_up_suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {msg.data.follow_up_suggestions.map((sug, si) => (
                          <button
                            key={si}
                            onClick={() => handleFollowUp(sug)}
                            className="text-xs px-3 py-1.5 rounded-full border border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                          >
                            {sug}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[10px] mt-1.5 opacity-60">{msg.timestamp}</p>
              </div>
            </div>
          ))
        )}

        {/* Typing Indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-card border border-border/30 rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0.15s' }} />
                <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0.3s' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status Message */}
      {statusMessage && (
        <div className="px-6 py-2">
          <p className="text-xs text-destructive flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3" /> {statusMessage}
          </p>
        </div>
      )}

      {/* Input */}
      <div className="px-6 py-4 border-t border-border/20">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your documents..."
            disabled={loading}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={loading || !input.trim()} className="gap-1.5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Ask
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Study Plan Tab ──────────────────────────────────────────────────────────

function StudyPlanTab({
  useSampleData,
  activeAgentId,
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
        const data = parseAgentResponse(result, ['title', 'overview', 'days', 'total_duration', 'tips']) as StudyPlanResponse
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
    setCheckedTasks(prev => ({ ...prev, [taskKey]: !prev[taskKey] }))
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/20">
        <h2 className="text-xl font-bold font-serif tracking-wide">Study Plan Generator</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Create a personalized study plan from your documents</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {/* Input Form */}
        <Card className="border-border/30">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="study-topic" className="text-sm font-medium">Topic *</Label>
                <Input
                  id="study-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., Machine Learning Fundamentals"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Exam Type</Label>
                <Select value={examType} onValueChange={setExamType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['General', 'UPSC', 'GRE', 'GMAT', 'SAT', 'Custom'].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium">Duration</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['1 week', '2 weeks', '1 month', '3 months'].map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium">Difficulty Level</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Beginner', 'Intermediate', 'Advanced'].map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={handleGenerate} disabled={loading || !topic.trim()} className="w-full gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate Study Plan
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status */}
        {statusMessage && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" /> {statusMessage}
          </p>
        )}

        {/* Loading Skeleton */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse">
                <div className="bg-muted rounded-lg h-32 w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Study Plan Display */}
        {!loading && displayPlan && (
          <div className="space-y-6">
            {/* Title Card */}
            <Card className="border-border/30 bg-gradient-to-br from-card to-secondary/30">
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold font-serif tracking-wide">{displayPlan?.title ?? 'Study Plan'}</h3>
                    {displayPlan?.overview && (
                      <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-2xl">{displayPlan.overview}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {displayPlan?.total_duration && (
                      <Badge variant="secondary" className="gap-1">
                        <Clock className="w-3 h-3" /> {displayPlan.total_duration}
                      </Badge>
                    )}
                    {displayPlan?.difficulty_level && (
                      <span className={cn('text-xs px-2 py-1 rounded-full border font-medium', getDifficultyColor(displayPlan.difficulty_level))}>
                        {displayPlan.difficulty_level}
                      </span>
                    )}
                    {displayPlan?.grounded_in_documents && (
                      <Badge variant="outline" className="gap-1 border-green-300 text-green-700">
                        <CheckCircle2 className="w-3 h-3" /> Grounded in Documents
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Day Cards Timeline */}
            {Array.isArray(displayPlan?.days) && displayPlan.days.map((day, dayIdx) => (
              <div key={dayIdx} className="flex gap-4">
                {/* Timeline Line */}
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {day?.day_number ?? dayIdx + 1}
                  </div>
                  {dayIdx < (displayPlan?.days?.length ?? 0) - 1 && (
                    <div className="w-0.5 flex-1 bg-border/40 mt-2" />
                  )}
                </div>

                {/* Day Content */}
                <Card className="flex-1 border-border/30 mb-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-serif">{day?.topic ?? 'Topic'}</CardTitle>
                      {(day?.estimated_hours ?? 0) > 0 && (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Clock className="w-3 h-3" /> {day.estimated_hours}h
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Subtopics */}
                    {Array.isArray(day?.subtopics) && day.subtopics.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Subtopics</p>
                        <ul className="space-y-1">
                          {day.subtopics.map((st, si) => (
                            <li key={si} className="text-sm flex items-start gap-2 leading-relaxed">
                              <ChevronRight className="w-3 h-3 mt-1 text-primary flex-shrink-0" />
                              {st}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Learning Objectives */}
                    {Array.isArray(day?.learning_objectives) && day.learning_objectives.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                          <Target className="w-3 h-3" /> Learning Objectives
                        </p>
                        <ul className="space-y-1">
                          {day.learning_objectives.map((obj, oi) => (
                            <li key={oi} className="text-sm flex items-start gap-2 leading-relaxed">
                              <CircleDot className="w-3 h-3 mt-1 text-accent flex-shrink-0" />
                              {obj}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Practice Tasks */}
                    {Array.isArray(day?.practice_tasks) && day.practice_tasks.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                          <ListChecks className="w-3 h-3" /> Practice Tasks
                        </p>
                        <ul className="space-y-1.5">
                          {day.practice_tasks.map((task, ti) => {
                            const taskKey = `${dayIdx}-${ti}`
                            return (
                              <li key={ti} className="text-sm flex items-start gap-2">
                                <button
                                  onClick={() => toggleTask(taskKey)}
                                  className={cn(
                                    'w-4 h-4 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors',
                                    checkedTasks[taskKey]
                                      ? 'bg-primary border-primary text-primary-foreground'
                                      : 'border-input hover:border-primary'
                                  )}
                                >
                                  {checkedTasks[taskKey] && <Check className="w-3 h-3" />}
                                </button>
                                <span className={cn(checkedTasks[taskKey] && 'line-through text-muted-foreground')}>
                                  {task}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}

                    {/* Resources */}
                    {Array.isArray(day?.resources) && day.resources.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
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
              <Card className="border-border/30 bg-gradient-to-br from-amber-50/50 to-card">
                <CardContent className="pt-6">
                  <p className="text-sm font-semibold flex items-center gap-1.5 mb-3 font-serif">
                    <Lightbulb className="w-4 h-4 text-accent" /> Study Tips
                  </p>
                  <ul className="space-y-2">
                    {displayPlan.tips.map((tip, ti) => (
                      <li key={ti} className="text-sm flex items-start gap-2 leading-relaxed">
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
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
              <GraduationCap className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-serif font-semibold mb-2">Create Your Study Plan</h3>
            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
              Enter a topic and customize your preferences. The AI will generate a structured study plan grounded in your uploaded documents.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Quiz Tab ────────────────────────────────────────────────────────────────

function QuizTab({
  useSampleData,
  activeAgentId,
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
        const data = parseAgentResponse(result, ['quiz_title', 'questions', 'total_questions', 'topic']) as QuizResponse
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
  const isMCQ = currentQ?.question_type?.toLowerCase()?.includes('mcq') || (Array.isArray(currentQ?.options) && currentQ.options.length > 0 && currentQ?.question_type !== 'short_answer')

  const handleSubmitAnswer = () => {
    const answer = isMCQ ? selectedAnswer : shortAnswer
    if (!answer.trim()) return
    setUserAnswers(prev => ({ ...prev, [currentQuestion]: answer }))
    setSubmitted(true)
  }

  const handleNextQuestion = () => {
    setSubmitted(false)
    setSelectedAnswer('')
    setShortAnswer('')
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(prev => prev + 1)
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

  // Calculate score
  const totalAnswered = Object.keys(userAnswers).length
  const correctCount = Object.entries(userAnswers).reduce((acc, [qIdx, ans]) => {
    const q = questions[parseInt(qIdx)]
    if (!q) return acc
    const correct = (q.correct_answer ?? '').toLowerCase().trim()
    const user = (ans ?? '').toLowerCase().trim()
    return acc + (correct === user || correct.includes(user) || user.includes(correct) ? 1 : 0)
  }, 0)
  const scorePercent = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0

  // Use sample data display
  useEffect(() => {
    if (useSampleData && !quiz && quizState === 'input') {
      // Just display; user can click "Start" to enter taking mode with sample
    }
  }, [useSampleData, quiz, quizState])

  const handleStartSample = () => {
    if (useSampleData && !quiz) {
      setQuizState('taking')
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/20">
        <h2 className="text-xl font-bold font-serif tracking-wide">Quiz Generator</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Test your knowledge with AI-generated quizzes</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* INPUT STATE */}
        {quizState === 'input' && (
          <div className="space-y-6">
            <Card className="border-border/30">
              <CardContent className="pt-6 space-y-5">
                <div>
                  <Label htmlFor="quiz-topic" className="text-sm font-medium">Topic *</Label>
                  <Input
                    id="quiz-topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., Machine Learning Basics"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium mb-2 block">Quiz Type</Label>
                  <div className="flex gap-2">
                    {['MCQ', 'Short Answer', 'Mixed'].map(t => (
                      <Button
                        key={t}
                        variant={quizType === t ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setQuizType(t)}
                        className="flex-1"
                      >
                        {t}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium mb-2 block">Number of Questions: {questionCount}</Label>
                  <div className="flex gap-2">
                    {[5, 10, 15, 20].map(n => (
                      <Button
                        key={n}
                        variant={questionCount === n ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setQuestionCount(n)}
                        className="flex-1"
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button onClick={handleGenerate} disabled={loading || !topic.trim()} className="w-full gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                  Generate Quiz
                </Button>
              </CardContent>
            </Card>

            {statusMessage && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> {statusMessage}
              </p>
            )}

            {loading && (
              <div className="space-y-4">
                {[1, 2].map(i => (
                  <div key={i} className="animate-pulse">
                    <div className="bg-muted rounded-lg h-24 w-full" />
                  </div>
                ))}
              </div>
            )}

            {/* Sample Data Preview */}
            {useSampleData && !quiz && !loading && (
              <Card className="border-border/30">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="font-serif">{SAMPLE_QUIZ?.quiz_title ?? 'Sample Quiz'}</CardTitle>
                      <CardDescription className="mt-1">
                        {SAMPLE_QUIZ?.topic ?? ''} -- {SAMPLE_QUIZ?.total_questions ?? 0} questions
                      </CardDescription>
                    </div>
                    {SAMPLE_QUIZ?.grounded_in_documents && (
                      <Badge variant="outline" className="gap-1 border-green-300 text-green-700">
                        <CheckCircle2 className="w-3 h-3" /> Grounded
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardFooter>
                  <Button onClick={handleStartSample} className="gap-2">
                    <ArrowRight className="w-4 h-4" /> Start Sample Quiz
                  </Button>
                </CardFooter>
              </Card>
            )}

            {/* Empty State */}
            {!useSampleData && !loading && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                  <HelpCircle className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-serif font-semibold mb-2">Create a Quiz</h3>
                <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                  Choose a topic and quiz preferences. The AI will generate questions grounded in your uploaded documents.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAKING QUIZ STATE */}
        {quizState === 'taking' && questions.length > 0 && currentQ && (
          <div className="space-y-6 max-w-2xl mx-auto">
            {/* Quiz Header */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Question {currentQuestion + 1} of {questions.length}
                </h3>
                {currentQ?.difficulty && (
                  <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', getDifficultyColor(currentQ.difficulty))}>
                    {currentQ.difficulty}
                  </span>
                )}
              </div>
              <Progress value={((currentQuestion + 1) / questions.length) * 100} className="h-2" />
            </div>

            {/* Question Card */}
            <Card className="border-border/30">
              <CardContent className="pt-6 space-y-5">
                <p className="text-base font-medium leading-relaxed">{currentQ?.question ?? ''}</p>

                {/* MCQ Options */}
                {isMCQ && Array.isArray(currentQ?.options) && currentQ.options.length > 0 && (
                  <div className="space-y-2">
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
                            'w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left text-sm transition-all duration-200',
                            !submitted && isSelected && 'border-primary bg-primary/5',
                            !submitted && !isSelected && 'border-border/40 hover:border-primary/50',
                            isCorrect && 'border-green-500 bg-green-50',
                            isWrong && 'border-red-500 bg-red-50',
                            submitted && !isCorrect && !isWrong && 'opacity-50'
                          )}
                        >
                          <span className={cn(
                            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border',
                            !submitted && isSelected && 'bg-primary text-primary-foreground border-primary',
                            !submitted && !isSelected && 'bg-secondary border-border/40',
                            isCorrect && 'bg-green-500 text-white border-green-500',
                            isWrong && 'bg-red-500 text-white border-red-500'
                          )}>
                            {submitted && isCorrect ? <Check className="w-3.5 h-3.5" /> : submitted && isWrong ? <X className="w-3.5 h-3.5" /> : letter}
                          </span>
                          <span>{opt}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Short Answer */}
                {!isMCQ && (
                  <Textarea
                    value={shortAnswer}
                    onChange={(e) => setShortAnswer(e.target.value)}
                    placeholder="Type your answer here..."
                    rows={4}
                    disabled={submitted}
                  />
                )}

                {/* Submit / Explanation */}
                {!submitted ? (
                  <Button
                    onClick={handleSubmitAnswer}
                    disabled={isMCQ ? !selectedAnswer : !shortAnswer.trim()}
                    className="w-full gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Submit Answer
                  </Button>
                ) : (
                  <div className="space-y-3">
                    {/* Correct Answer */}
                    <div className="p-3 bg-secondary/50 rounded-lg border border-border/20">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Correct Answer</p>
                      <p className="text-sm font-medium">{currentQ?.correct_answer ?? ''}</p>
                    </div>

                    {/* Explanation */}
                    {currentQ?.explanation && (
                      <div className="p-3 bg-secondary/50 rounded-lg border border-border/20">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                          <Lightbulb className="w-3 h-3" /> Explanation
                        </p>
                        <p className="text-sm leading-relaxed">{currentQ.explanation}</p>
                      </div>
                    )}

                    <Button onClick={handleNextQuestion} className="w-full gap-2">
                      {currentQuestion < questions.length - 1 ? (
                        <><ArrowRight className="w-4 h-4" /> Next Question</>
                      ) : (
                        <><Trophy className="w-4 h-4" /> View Results</>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* RESULTS STATE */}
        {quizState === 'results' && (
          <div className="space-y-6 max-w-2xl mx-auto">
            {/* Score Card */}
            <Card className="border-border/30 bg-gradient-to-br from-card to-secondary/30">
              <CardContent className="pt-6 text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Trophy className="w-10 h-10 text-primary" />
                </div>
                <h3 className="text-2xl font-bold font-serif">{correctCount} / {totalAnswered}</h3>
                <p className="text-muted-foreground text-sm mt-1">Questions answered correctly</p>
                <div className="mt-4">
                  <Progress value={scorePercent} className="h-3 max-w-xs mx-auto" />
                  <p className="text-lg font-bold mt-2">{scorePercent}%</p>
                </div>
                <div className="flex gap-3 justify-center mt-6">
                  <Button variant="outline" onClick={handleRetake} className="gap-1.5">
                    <RotateCcw className="w-4 h-4" /> Retake Quiz
                  </Button>
                  <Button onClick={handleNewQuiz} className="gap-1.5">
                    <Brain className="w-4 h-4" /> New Quiz
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Per-question Review */}
            <Card className="border-border/30">
              <CardHeader>
                <CardTitle className="text-base font-serif">Question Review</CardTitle>
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
                        <AccordionTrigger className="text-sm">
                          <div className="flex items-center gap-2 text-left">
                            {isCorrect ? (
                              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                            )}
                            <span className="line-clamp-1">Q{(q?.question_number ?? qi + 1)}: {q?.question ?? ''}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 pl-6 text-sm">
                            <div>
                              <span className="text-muted-foreground">Your answer: </span>
                              <span className={cn('font-medium', isCorrect ? 'text-green-700' : 'text-red-600')}>{userAns || 'Not answered'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Correct answer: </span>
                              <span className="font-medium text-green-700">{q?.correct_answer ?? ''}</span>
                            </div>
                            {q?.explanation && (
                              <div className="p-2 bg-secondary/50 rounded text-muted-foreground mt-1">
                                {q.explanation}
                              </div>
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

// ─── Documents Tab ───────────────────────────────────────────────────────────

function DocumentsTab() {
  const { documents, loading, error, fetchDocuments } = useRAGKnowledgeBase()

  useEffect(() => {
    fetchDocuments(RAG_ID)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getFileTypeIcon = (fileType: string) => {
    switch (fileType) {
      case 'pdf': return 'PDF'
      case 'docx': return 'DOCX'
      case 'txt': return 'TXT'
      default: return 'FILE'
    }
  }

  const getFileTypeBg = (fileType: string) => {
    switch (fileType) {
      case 'pdf': return 'bg-red-100 text-red-700'
      case 'docx': return 'bg-blue-100 text-blue-700'
      case 'txt': return 'bg-gray-100 text-gray-700'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/20">
        <h2 className="text-xl font-bold font-serif tracking-wide">Document Library</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your knowledge base documents</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {/* Upload Zone */}
        <KnowledgeBaseUpload
          ragId={RAG_ID}
          onUploadSuccess={() => fetchDocuments(RAG_ID)}
          onDeleteSuccess={() => fetchDocuments(RAG_ID)}
        />

        {/* Error */}
        {error && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" /> {error}
          </p>
        )}

        {/* Documents Grid */}
        {loading && !documents && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse">
                <div className="bg-muted rounded-lg h-28" />
              </div>
            ))}
          </div>
        )}

        {Array.isArray(documents) && documents.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
              {documents.length} Document{documents.length !== 1 ? 's' : ''} in Library
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map((doc: RAGDocument) => (
                <Card key={doc.fileName} className="border-border/30 hover:shadow-md transition-shadow duration-200">
                  <CardContent className="pt-5">
                    <div className="flex items-start gap-3">
                      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0', getFileTypeBg(doc.fileType))}>
                        {getFileTypeIcon(doc.fileType)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{doc.fileName}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {doc?.status && (
                            <Badge variant={doc.status === 'active' ? 'default' : 'secondary'} className="text-[10px] h-5">
                              {doc.status === 'active' ? <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> : null}
                              {doc.status}
                            </Badge>
                          )}
                          {(doc?.documentCount ?? 0) > 0 && (
                            <span className="text-[10px] text-muted-foreground">{doc.documentCount} chunks</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {Array.isArray(documents) && documents.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
              <FolderOpen className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-serif font-semibold mb-2">No Documents Yet</h3>
            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
              Upload your first document to get started. The AI will use your documents to answer questions, create study plans, and generate quizzes.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Page() {
  const [activeTab, setActiveTab] = useState('chat')
  const [useSampleData, setUseSampleData] = useState(false)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground flex">
        {/* Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          showUploadDialog={showUploadDialog}
          setShowUploadDialog={setShowUploadDialog}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-h-screen">
          {/* Top Bar */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border/20 bg-card/50">
            <div className="flex items-center gap-2">
              {activeAgentId && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  <span>
                    {AGENTS.find(a => a.id === activeAgentId)?.name ?? 'Agent'} is working...
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground cursor-pointer">Sample Data</Label>
              <Switch
                id="sample-toggle"
                checked={useSampleData}
                onCheckedChange={setUseSampleData}
              />
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'chat' && (
              <ChatTab
                useSampleData={useSampleData}
                activeAgentId={activeAgentId}
                setActiveAgentId={setActiveAgentId}
              />
            )}
            {activeTab === 'study' && (
              <StudyPlanTab
                useSampleData={useSampleData}
                activeAgentId={activeAgentId}
                setActiveAgentId={setActiveAgentId}
              />
            )}
            {activeTab === 'quiz' && (
              <QuizTab
                useSampleData={useSampleData}
                activeAgentId={activeAgentId}
                setActiveAgentId={setActiveAgentId}
              />
            )}
            {activeTab === 'documents' && <DocumentsTab />}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
