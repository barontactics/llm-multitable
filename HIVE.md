# Work Session: February 21, 2026

## Summary
Enhanced file reading behavior in LLM MultiTable to prevent PII exposure and ensure AI agent asks intelligent guiding questions instead of dumping file content.

---

## Changes Implemented

### 1. **Auto-trigger File Analysis from File Browser**
**File:** `src/components/chat/ChatModal.tsx` (lines 138-143)

**What changed:**
- When user selects a file from the file browser (Local or Google Drive), it now automatically triggers the `read_file` tool
- Previously: File path was inserted into input box, requiring manual user action
- Now: Immediately sends "Analyze {file.path}" message to trigger agent analysis

**Code:**
```typescript
const handleFileSelect = (path: string) => {
  setActiveBrowser(null)
  if (!isBusy) {
    sendMessage(session.id, `Analyze ${path}`)
  }
}
```

---

### 2. **Privacy-First File Reading System**
**Files:** `server/index.ts`, `server/mcp-tools.ts`, `server/gdrive-tools.ts`

#### System Prompt Updates (server/index.ts:59-116)
Added comprehensive instructions for AI agent behavior:

**CRITICAL FILE READING BEHAVIOR:**
- Agent receives full file content in `<file_content>` tags (hidden from user UI)
- Must analyze content internally
- Must consider relationships between multiple files in context
- **IMMEDIATELY** respond with 3-5 guiding questions after reading

**ABSOLUTE PROHIBITIONS:**
- NEVER dump file content, excerpts, or quotes
- NEVER output personal names, emails, phone numbers, or any PII
- NEVER provide summaries with personal details
- Refer to people by ROLES (e.g., "the consultant", "the client") instead of names

**REQUIRED WORKFLOW:**
```
"I've analyzed [filename]. Here are some ways I can help:

• [Question 1 based on file content]
• [Question 2 considering relationships with other files in context]
• [Question 3 suggesting concrete actions]
• [Question 4 about potential next steps]
• [Question 5 if applicable]

What would be most useful for you right now?"
```

#### Tool Implementation Updates

**Local Files (server/mcp-tools.ts:122-138):**
```typescript
case 'read_file': {
  const filePath = safePath(path)
  const content = await fs.readFile(filePath, 'utf-8')
  const stats = await fs.stat(filePath)
  const fileName = filePath.split('/').pop() || path
  const lines = content.split('\n').length

  const formattedContent = `📄 File: ${fileName}\n` +
                          `📂 Path: ${path}\n` +
                          `📊 Size: ${(stats.size / 1024).toFixed(2)} KB\n` +
                          `📝 Lines: ${lines}\n` +
                          `🔗 View: file://${filePath}\n\n` +
                          `<file_content>\n${content}\n</file_content>`

  return { content: formattedContent }
}
```

**Google Drive Files (server/gdrive-tools.ts):**
Updated all file type handlers to include full content in `<file_content>` tags:

- **PDF files** (lines 248-257): Extract text via pdf-parse
- **Word documents** (lines 282-290): Extract text via mammoth
- **Excel spreadsheets** (lines 309-326): Convert sheets to CSV
- **Google Workspace files** (lines 388-395): Export as plain text
- **Plain text files** (lines 408-415): Direct UTF-8 content
- **Textract files** (lines 443-449): Various formats via textract

All handlers return:
```
📄 File: {name}
📎 Type: {mimeType}
📊 {metadata}
🔗 View: {link}

<file_content>
{FULL CONTENT HERE - HIDDEN FROM UI}
</file_content>
```

---

### 3. **Frontend Content Filtering**
**File:** `src/components/chat/ChatModal.tsx` (lines 10-35)

**What changed:**
Added regex filter to strip `<file_content>` tags from UI display:

```typescript
function renderContentWithLinks(content: string) {
  // Strip out <file_content> tags and their contents (internal for agent only)
  const cleanedContent = content.replace(/<file_content>[\s\S]*?<\/file_content>/g, '')

  // Match URLs and render as clickable links
  const urlRegex = /(https?:\/\/[^\s]+|file:\/\/[^\s]+)/g
  const parts = cleanedContent.split(urlRegex)

  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return <a href={part} target="_blank" rel="noopener noreferrer">{part}</a>
    }
    return part
  })
}
```

**Result:**
- Users see: File metadata + clickable view links + AI's guiding questions
- Users DON'T see: Raw file content or PII
- AI sees: Everything (for internal analysis)

---

## User Experience Flow

### Before Changes:
1. User clicks file in browser → Path inserted into input box
2. User manually sends message
3. AI reads file → Dumps first 1000 chars of content into chat
4. Personal names, emails, addresses visible in UI

### After Changes:
1. User clicks file in browser → Auto-triggers analysis
2. AI reads file internally (full content in `<file_content>` tags)
3. AI responds with metadata + intelligent guiding questions
4. No PII exposed, questions consider multi-file context

---

## Example Output

**What user sees:**
```
📄 File: consultant_onboarding.docx
📎 Type: Microsoft Word Document
🔗 View: https://drive.google.com/...

I've analyzed consultant_onboarding.docx. Here are some ways I can help:

• Would you like me to extract the timeline and key milestones?
• Should I identify any gaps or missing information in the process?
• Do you want me to compare this against industry best practices?
• Would you like me to create a checklist template based on the structure I see?
• Should I help draft communication materials following this framework?

What would be most useful for you right now?
```

**What AI sees internally:**
```
📄 File: consultant_onboarding.docx
📎 Type: Microsoft Word Document
🔗 View: https://drive.google.com/...

<file_content>
CONSULTANT ONBOARDING BRIEF

AI-Native Software Factory

Company Architecture, Business Model & Key Terminology

[... FULL 15-PAGE DOCUMENT WITH ALL DETAILS ...]
</file_content>
```

---

## Technical Architecture

### Data Flow:
```
User clicks file
    ↓
handleFileSelect() auto-sends "Analyze {path}"
    ↓
Backend /api/chat endpoint
    ↓
executeMCPTool() or executeGDriveTool()
    ↓
Read file + wrap in <file_content> tags
    ↓
Send to Claude API with system prompt
    ↓
Claude analyzes content + generates questions
    ↓
Stream response to frontend
    ↓
renderContentWithLinks() strips <file_content> tags
    ↓
User sees metadata + questions only
```

### Key Components:
- **File Browser:** `src/components/storage/FileBrowsers.tsx`
- **Chat Modal:** `src/components/chat/ChatModal.tsx`
- **Chat Store:** `src/store/chatStore.ts`
- **Backend API:** `server/index.ts`
- **Local Tools:** `server/mcp-tools.ts`
- **GDrive Tools:** `server/gdrive-tools.ts`

---

## Files Modified

1. **src/components/chat/ChatModal.tsx**
   - Lines 11-35: Added `<file_content>` tag filtering
   - Lines 138-143: Auto-trigger file analysis on selection

2. **server/index.ts**
   - Lines 59-116: Enhanced system prompt with privacy rules and required workflow

3. **server/mcp-tools.ts**
   - Lines 122-138: Updated local file reading to include full content in tags

4. **server/gdrive-tools.ts**
   - Lines 248-257: PDF handler
   - Lines 282-290: Word handler
   - Lines 309-326: Excel handler
   - Lines 388-395: Google Workspace handler
   - Lines 408-415: Plain text handler
   - Lines 443-449: Textract handler

---

## TODO Next

### Enable Subscription-Based Consumption
**Goal:** Switch from pay-per-use API billing to subscription-based consumption

**Research Tasks:**
1. Investigate **OpenClaw** integration
2. Hook up with **Claude Code in terminal**
3. Explore Anthropic subscription options vs. API billing
4. Determine if subscription model is available for API access

**Technical Questions:**
- Does Anthropic offer subscription-based API access?
- What is OpenClaw and how does it relate to billing?
- Can Claude Code terminal access use different billing method?
- Current setup uses `@anthropic-ai/sdk` with API key - what alternatives exist?

**Current Billing:**
- Using Anthropic API with `process.env.ANTHROPIC_API_KEY`
- Pay-per-token consumption model
- Haiku model used for context extraction to reduce costs
- Sonnet 4 used for main chat interactions

---

## Notes

- All file content is now hidden from UI via regex stripping
- AI has full access to content for intelligent analysis
- Privacy-first: No PII or personal names in chat display
- Multi-file context awareness: AI considers relationships between files
- Auto-triggering improves UX: No manual steps needed after file selection

---

**Session End:** Work completed successfully. All changes tested and functional.
