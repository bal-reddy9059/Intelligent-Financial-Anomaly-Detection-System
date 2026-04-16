// Global type augmentation for the Web Speech API.
// SpeechRecognition is in the spec but still missing from lib.dom.d.ts in many TS versions.
// webkitSpeechRecognition is the legacy Chrome/Edge prefix.

interface Window {
  SpeechRecognition: typeof SpeechRecognition;
  webkitSpeechRecognition: typeof SpeechRecognition;
}
