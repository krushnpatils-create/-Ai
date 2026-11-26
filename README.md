# Atlas: personal AI assistant

A chat website that sends your instructions to a real AI model through a Netlify Function. API keys stay on the server and never reach the browser.

- Frontend: static HTML/CSS/JS in `public/` (no build step)
- Backend: `netlify/functions/chat.js` (served at `/api/chat`)
- Providers: Anthropic (default) or any OpenAI-compatible API, chosen with environment variables
- Features: chat history, new/delete/clear chat, Markdown, code copy buttons, copy/download/regenerate, light/dark theme, standing instructions, file attachments (text/code files up to 100 KB, PNG/JPEG/WebP/GIF images up to 1.5 MB)
- History is stored in your browser (localStorage). Image data is not saved, so reloading a chat will not resend old images.

## 1. Run locally
1. Install Node.js 18 or newer.
2. In this folder: `npm install`
3. Copy `.env.example` to `.env` and fill in your key (step 2 below).
4. `npm run dev` and open the URL it prints (usually http://localhost:8888).
5. Optional: `npm test` checks the backend function.

Opening `index.html` directly will not work, because the API lives in the Netlify Function. Use `npm run dev`.

## 2. Configure the AI API key
Anthropic (default): create a key at https://console.anthropic.com and set `ANTHROPIC_API_KEY`.

OpenAI or compatible: set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and optionally `OPENAI_BASE_URL`.

Optional: `AI_MODEL` (defaults: `claude-sonnet-5-5` / `gpt-4o-mini`) and `AI_MAX_TOKENS`. Check your provider's docs for current model names. Switching provider or model needs only a changed variable and a redeploy.

If no key is set, the site shows a setup message instead of a reply.

## 3. Upload to GitHub
1. Create an empty repository at https://github.com/new (do not add a README).
2. In this folder:
```
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
git push -u origin main
```
`.env` is in `.gitignore`, so your key is not uploaded.

## 4. Connect GitHub to Netlify
1. Sign in at https://app.netlify.com, choose **Add new site > Import an existing project > GitHub**.
2. Authorize Netlify and pick your repository.
3. Settings are read from `netlify.toml` (publish `public`, functions `netlify/functions`). Leave the build command empty.

## 5. Set environment variables in Netlify
**Site configuration > Environment variables > Add a variable**. Add `ANTHROPIC_API_KEY` (or the OpenAI variables), plus `AI_PROVIDER` and `AI_MODEL` if you want. Then **Deploys > Trigger deploy > Deploy site**. Variables apply only to new deploys.

## 6. Deploy and test
1. Open the site URL shown by Netlify.
2. Send "Say hello in three languages." You should get a real reply.
3. A red message about a missing key means the variable name is wrong or you did not redeploy.
4. Long replies: Netlify's default function time limit is short (10 seconds on many plans). If replies time out, lower `AI_MAX_TOKENS` or raise the function timeout in your Netlify plan settings.
5. Check **Logs > Functions** in Netlify for server-side errors.

## Notes
- Anyone with your site URL can use your API key's quota. For private use, enable Netlify password protection or an identity provider, and set a spending limit with your AI provider.
- Not supported: PDFs and Office files, web browsing, and streaming replies.
