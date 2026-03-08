import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  HelpCircle,
  MessageCircle,
  Mail,
  Phone,
  ChevronDown,
  ChevronUp,
  Send,
  CheckCircle,
} from "lucide-react"
import Header from "./Header"
import SidebarContent from "./SidebarContent"
import { auth, db } from "./firebase"
import { addDoc, collection, serverTimestamp } from "firebase/firestore"

const faqs = [
  {
    question: "How does fraud detection work?",
    answer:
      "Our AI system analyzes every transaction in real-time using machine learning models trained on millions of transactions. It looks for unusual patterns, such as transactions from unknown locations, abnormal amounts, or atypical spending behaviour, and flags them for review.",
  },
  {
    question: "What should I do if I see a suspicious transaction?",
    answer:
      "Immediately navigate to the Transactions page and click on the flagged transaction to view details. You can report it directly from there. You should also change your password via Settings and contact our support team.",
  },
  {
    question: "How do I send money to a new beneficiary?",
    answer:
      "Go to the Beneficiaries page, add the new recipient's UPI ID or bank details, then use Send Money to initiate a transfer. New beneficiaries may trigger an additional verification step for your security.",
  },
  {
    question: "Why was my transaction blocked?",
    answer:
      "Transactions may be blocked if our system detects a high fraud risk score. This can happen due to unusual amount, location, or frequency. You can appeal a blocked transaction by contacting support below.",
  },
  {
    question: "How do I download my account statement?",
    answer:
      "Navigate to Statements from the sidebar. You can filter by date range and download your statement as a PDF or CSV file.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Yes. All data is encrypted in transit and at rest. We use Firebase Authentication, industry-standard TLS encryption, and follow OWASP security best practices to protect your account.",
  },
]

const HelpSupport = () => {
  const [user, setUser] = useState(null)
  const [openFaq, setOpenFaq] = useState(null)
  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [contactMessage, setContactMessage] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const currentUser = auth.currentUser
    if (currentUser) {
      setUser(currentUser)
      setContactName(currentUser.displayName || "")
      setContactEmail(currentUser.email || "")
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!contactMessage.trim()) return
    setSubmitting(true)
    try {
      await addDoc(collection(db, "supportTickets"), {
        name: contactName,
        email: contactEmail,
        message: contactMessage,
        userId: auth.currentUser?.uid || null,
        createdAt: serverTimestamp(),
        status: "open",
      })
      setSubmitted(true)
      setContactMessage("")
    } catch (err) {
      console.error("Failed to submit support ticket:", err)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index)
  }

  return (
    <div className="flex min-h-screen bg-gray-900 text-gray-100">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-72 min-h-screen border-r border-gray-800 bg-gray-900">
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <Header user={user} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="p-6 space-y-6"
        >
          {/* Page Title */}
          <div className="flex items-center space-x-3">
            <HelpCircle className="h-7 w-7 text-blue-400" />
            <h1 className="text-2xl font-bold text-gray-100">Help & Support</h1>
          </div>

          {/* Quick Contact Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="flex items-center space-x-4 p-5">
                <div className="bg-blue-500/10 p-3 rounded-lg">
                  <Mail className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-100">Email Us</p>
                  <p className="text-xs text-gray-400">support@safepayai.com</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="flex items-center space-x-4 p-5">
                <div className="bg-green-500/10 p-3 rounded-lg">
                  <Phone className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-100">Call Support</p>
                  <p className="text-xs text-gray-400">+91 1800-XXX-XXXX (24/7)</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="flex items-center space-x-4 p-5">
                <div className="bg-purple-500/10 p-3 rounded-lg">
                  <MessageCircle className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-100">Live Chat</p>
                  <p className="text-xs text-gray-400">Average wait: &lt; 2 minutes</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* FAQ Section */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-100 flex items-center space-x-2">
                <HelpCircle className="h-5 w-5 text-blue-400" />
                <span>Frequently Asked Questions</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {faqs.map((faq, index) => (
                <div
                  key={index}
                  className="border border-gray-700 rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => toggleFaq(index)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-100 hover:bg-gray-700/50 transition-colors"
                  >
                    <span>{faq.question}</span>
                    {openFaq === index ? (
                      <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0 ml-2" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0 ml-2" />
                    )}
                  </button>
                  {openFaq === index && (
                    <div className="px-4 pb-4 text-sm text-gray-400 bg-gray-700/20">
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Contact Form */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-100 flex items-center space-x-2">
                <Send className="h-5 w-5 text-blue-400" />
                <span>Send Us a Message</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {submitted ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-3 text-center">
                  <CheckCircle className="h-12 w-12 text-green-400" />
                  <p className="text-lg font-semibold text-gray-100">Message Sent!</p>
                  <p className="text-sm text-gray-400">
                    We've received your message and will get back to you within 24 hours.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-2 border-gray-600 text-gray-300 hover:bg-gray-700"
                    onClick={() => setSubmitted(false)}
                  >
                    Send Another Message
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-sm text-gray-400">Your Name</Label>
                      <Input
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        placeholder="Full name"
                        className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm text-gray-400">Email Address</Label>
                      <Input
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm text-gray-400">Message</Label>
                    <textarea
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                      placeholder="Describe your issue or question..."
                      rows={5}
                      required
                      className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="bg-blue-600 hover:bg-blue-700 text-white flex items-center space-x-2"
                  >
                    <Send className="h-4 w-4" />
                    <span>{submitting ? "Sending..." : "Submit Message"}</span>
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  )
}

export default HelpSupport
