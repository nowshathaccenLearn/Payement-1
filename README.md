## Payment Site (Netlify-ready)

This project is a simple UPI payment collection page where users:
- click a UPI intent link to pay **₹1** to `gomathiannaduraiannadurai@okaxis`
- upload a payment receipt screenshot (JPG/JPEG/PNG up to 5MB)
- after submission, the system emails **both the admin and the payer** with the receipt attached

### Deploy on Netlify (recommended)

Netlify hosts the static frontend (`public/`) and runs the backend as a serverless function.

#### 1) Push to GitHub
- Put the `payment-site/` folder into a Git repo and push it to GitHub.

#### 2) Create a Netlify site
- Netlify Dashboard → **Add new site** → **Import an existing project**
- Choose your repo

Build settings:
- **Base directory**: `payment-site`
- **Build command**: (leave empty)
- **Publish directory**: `payment-site/public`

Netlify automatically reads `payment-site/netlify.toml`.

#### 3) Set environment variables in Netlify
Netlify Dashboard → Site → **Site configuration** → **Environment variables**:
- `GMAIL_USER` = your Gmail address (sender)
- `GMAIL_PASS` = Gmail **App Password** (recommended)
- `ADMIN_EMAIL` = `nowshathtech@gmail.com` (optional; defaults to this)

#### 4) Deploy
After deploy, open your Netlify URL and test:
- Pay via UPI (on mobile)
- Upload receipt
- Submit receipt → emails go to admin + payer

### Run locally

#### Option A: Netlify local dev (recommended for testing)

```bash
cd payment-site
npm install
npm run netlify:dev
```

Open the URL Netlify prints (usually `http://localhost:8888`).

#### Option B: Express server (legacy local mode)

The repo still includes `server.js` for local Express usage, but **Netlify deployment does not use it**.

```bash
cd payment-site
npm install
npm start
```

Then open `http://localhost:3001`.


