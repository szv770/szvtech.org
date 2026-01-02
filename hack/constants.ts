
import { PlatformConfig } from './types';

export const PLATFORMS: PlatformConfig[] = [
  { 
    id: 'WhatsApp', label: 'WhatsApp', actionLabel: 'Sync Messages', placeholder: '+1 234 567 8900', 
    pattern: /^\+[1-9]\d{10,14}$/, hint: 'Full international format: +[country][number]',
    color: 'from-[#25D366] to-[#128C7E]', 
    iconPath: 'M12.031 2c-5.516 0-9.984 4.469-9.984 9.984 0 1.766.453 3.422 1.25 4.875L2 22l5.25-1.375c1.453.797 3.109 1.25 4.875 1.25 5.516 0 9.984-4.469 9.984-9.984S17.547 2 12.031 2zm6.359 14.156c-.266.75-1.547 1.375-2.141 1.453-.594.078-1.25.109-3.484-.797-2.859-1.156-4.688-4.063-4.828-4.25-.141-.188-1.125-1.5-1.125-2.859 0-1.359.703-2.031 1-2.313.297-.281.656-.359.875-.359.219 0 .438.016.625.016.188 0 .438-.078.688.516.25.594.859 2.094.938 2.25.078.156.125.344.031.531-.094.188-.141.313-.281.469-.141.156-.297.359-.422.484-.141.125-.297.266-.125.563.172.297.766 1.266 1.641 2.047.875.781 1.609 1.016 1.906 1.156.297.141.469.125.641-.078.172-.203.734-.859.938-1.156.203-.297.406-.25.688-.156.281.094 1.797.844 2.109 1 .313.156.516.234.594.359.078.125.078.719-.188 1.469z'
  },
  { 
    id: 'Signal', label: 'Signal', actionLabel: 'Decrypt Comms', placeholder: '+1 234 567 8900', 
    pattern: /^\+[1-9]\d{10,14}$/, hint: 'E.164 phone format required',
    color: 'from-[#2C6BED] to-[#1F4BB8]', 
    iconPath: 'M12 2C6.48 2 2 6.48 2 12c0 1.94.55 3.75 1.5 5.29L2 22l4.81-1.46c1.51.87 3.25 1.46 5.19 1.46 5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.63 0-3.13-.51-4.38-1.37l-.31-.21-2.29.69.7-2.22-.24-.36C4.59 15.35 4 13.74 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z'
  },
  { 
    id: 'Instagram', label: 'Instagram', actionLabel: 'Scrape Profile', placeholder: '@username', 
    pattern: /^@[a-zA-Z0-9._]{1,30}$/, hint: 'Must start with @',
    color: 'from-[#E1306C] to-[#5851DB]', 
    iconPath: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.981 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z'
  },
  { 
    id: 'Email', label: 'Email', actionLabel: 'Intercept Inbox', placeholder: 'target@domain.com', 
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, hint: 'Valid email address required',
    color: 'from-[#D44638] to-[#B23121]', 
    iconPath: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z'
  },
  { 
    id: 'X', label: 'X', actionLabel: 'Monitor Feed', placeholder: '@handle', 
    pattern: /^@[a-zA-Z0-9_]{4,15}$/, hint: 'Twitter/X handle format',
    color: 'from-slate-700 to-slate-950', 
    iconPath: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.932zm-1.292 19.49h2.039L6.486 3.24H4.298l13.311 17.403z'
  },
  { 
    id: 'Discord', label: 'Discord', actionLabel: 'Infiltrate Servers', placeholder: 'username', 
    pattern: /^[a-z0-9_.]{2,32}$/, hint: 'Discord tag or username',
    color: 'from-[#5865F2] to-[#404EED]', 
    iconPath: 'M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.68 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.862-1.297 1.201-1.996a.076.076 0 00-.041-.105 13.11 13.11 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.196.373.291a.077.077 0 01-.006.127 12.299 12.299 0 01-1.872.892.077.077 0 00-.041.107c.34.698.74 1.365 1.201 1.995a.076.076 0 00.085.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.086 2.176 2.419 0 1.334-.966 2.419-2.176 2.419zm7.974 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.086 2.176 2.419 0 1.334-.946 2.419-2.176 2.419z'
  },
  { 
    id: 'TikTok', label: 'TikTok', actionLabel: 'Access Analytics', placeholder: '@username', 
    pattern: /^@[a-zA-Z0-9._]{2,24}$/, hint: 'TikTok username format',
    color: 'from-[#00f2ea] to-[#ff0050]', 
    iconPath: 'M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'
  },
];

export const STAGES = [
  { name: 'NETWORK_RECON', logs: ['Establishing proxy tunnel...', 'Resolving target endpoints...', 'Analyzing regional firewall rules...', 'Connection established via Cluster-X.'] },
  { name: 'CRYPTO_INJECTION', logs: ['Injecting temporary decryption key...', 'Scanning memory buffer for session tokens...', 'Detected O-Day in SSL implementation', 'Memory bridge secured.'] },
  { name: 'FILESYSTEM_ACCESS', logs: ['Mounting virtual filesystem...', 'Mapping database tables for %ID%...', 'Bypassing permission handler...', 'Root access verified.'] },
  { name: 'DATA_EXFILTRATION', logs: ['Decrypting message blobs...', 'Applying salt hashes to fragmented strings...', 'Parsing conversation structure...', 'Payload ready for visualization.'] }
];

export const FAKE_CHATS = {
  'WhatsApp': [
    { sender: 'Target', msg: "Did you delete those files?", time: '10:42 PM' },
    { sender: 'Contact', msg: "Everything is wiped. Don't worry.", time: '10:44 PM' },
    { sender: 'Target', msg: "I think someone accessed the server.", time: '10:45 PM' }
  ],
  'Signal': [
    { sender: 'Target', msg: "Aether protocol is active.", time: '09:12 AM' },
    { sender: 'Contact', msg: "I told you it was possible.", time: '09:14 AM' },
    { sender: 'Target', msg: "Check the drive for the update.", time: '09:20 AM' }
  ],
  'Email': [
    { sender: 'Bank Support', msg: "Verification code: 824-112", time: 'Yesterday' },
    { sender: 'Legal Partner', msg: "NDA attached. Review immediately.", time: '12:00 PM' }
  ]
};

export const DEFAULT_CHATS = [
  { sender: 'Unknown', msg: "Target verified. Proceeding.", time: '00:01' },
  { sender: 'Target', msg: "Waiting for handshake.", time: '00:05' }
];

export const MOCK_METRICS = {
  'WhatsApp': { messages: '2.1M', data: '42.5 GB', status: 'ACTIVE' },
  'Signal': { safe_keys: '4', messages: '124k', security: 'MAX' },
  'Email': { inbox: '12,412', attachments: '1.2 TB', server: 'TLS 1.3' },
  'Instagram': { dms: '4,102', stories: '14', followers: '12.4k' },
};
