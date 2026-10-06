# Deploy (უფასოდ)

| ნაწილი | სერვისი |
|---|---|
| Backend (Express) | Render — Free Web Service (`render.yaml`) |
| PostgreSQL | Neon — Free |
| სურათები (S3) | Cloudflare R2 — 10 GB უფასო |
| Frontend (React) | Cloudflare Pages — Free |

> Render-ის უფასო backend 15 წთ უმოქმედობის შემდეგ "იძინებს"; პირველი მოთხოვნა ~30–50 წმ ელოდება.
> პრეზენტაციამდე საიტი ერთი წუთით ადრე გახსენი.

---

## 0. კოდი GitHub-ზე

```bash
cd final-project
git init
git add .
git status          # შეამოწმე, რომ .env ფაილები სიაში არ არის!
git commit -m "Initial commit"
```

GitHub-ზე შექმენი ცარიელი repo (მაგ. `image-wallet`, შეიძლება Private) და:

```bash
git remote add origin https://github.com/<შენი-username>/image-wallet.git
git branch -M main
git push -u origin main
```

## 1. Neon — PostgreSQL

1. [neon.tech](https://neon.tech) → Sign up (GitHub-ით) → **Create project**, region: **Frankfurt (eu-central-1)**.
2. Dashboard → **Connect** → ჩართული **Pooled connection გამორთე** (direct connection გვჭირდება
   `prisma migrate`-ისთვის) → დააკოპირე connection string:
   ```
   postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
   ეს არის `DATABASE_URL`.

## 2. Cloudflare R2 — სურათები

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **R2 Object Storage** → (შეიძლება ბარათის მიბმა მოითხოვოს, თანხა არ ჩამოიჭრება 10 GB-მდე).
2. **Create bucket** → სახელი: `image-wallet` → Location: Automatic.
3. R2 მთავარ გვერდზე → **Manage API tokens** → **Create API token**:
   - Permissions: **Object Read & Write**
   - Specify bucket: `image-wallet`
4. შექმნის შემდეგ დაიმახსოვრე (მეორედ აღარ გაჩვენებს):
   - **Access Key ID** → `AWS_ACCESS_KEY_ID`
   - **Secret Access Key** → `AWS_SECRET_ACCESS_KEY`
   - **Endpoint** `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` → `AWS_S3_ENDPOINT`

CORS-ის დაყენება R2-ზე საჭირო არ არის: სურათები `<img>`-ით, presigned URL-ით იტვირთება.

## 3. Render — Backend

1. [render.com](https://render.com) → Sign up (GitHub-ით).
2. **New → Blueprint** → აირჩიე repo. Render წაიკითხავს `render.yaml`-ს და მოგთხოვს მნიშვნელობებს:

   | ცვლადი | მნიშვნელობა |
   |---|---|
   | `DATABASE_URL` | Neon-ის connection string (ნაბიჯი 1) |
   | `CORS_ORIGIN` | frontend-ის მისამართი, მაგ. `https://image-wallet.pages.dev` (Pages-ის პროექტის სახელი, რომელსაც ნაბიჯ 4-ში დაარქმევ) |
   | `AWS_S3_ENDPOINT` | R2 endpoint (ნაბიჯი 2) |
   | `AWS_S3_BUCKET` | `image-wallet` |
   | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | R2-ის გასაღებები |
   | `TWILIO_*` | Twilio-ს მონაცემები, ან ცარიელი (იხ. „SMS“ ქვემოთ) |

   `JWT_SECRET` და `WEBHOOK_SECRET` Render თავად აგენერირებს.
3. **Apply** → პირველი build ~3–5 წუთი. ყოველ გაშვებაზე `prisma migrate deploy` ავტომატურად ქმნის ცხრილებს.
4. შეამოწმე: `https://image-wallet-api.onrender.com/api/health` → `{"success":true,...,"database":"up"}`.
   (ზუსტი მისამართი Render-ის სერვისის გვერდზე წერია.)

## 4. Cloudflare Pages — Frontend

1. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → აირჩიე repo.
2. პარამეტრები:

   | ველი | მნიშვნელობა |
   |---|---|
   | Project name | `image-wallet` (→ `https://image-wallet.pages.dev`) |
   | Framework preset | None |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | `frontend` |

3. **Environment variables**:
   - `VITE_API_URL` = `https://image-wallet-api.onrender.com/api` (შენი Render-ის მისამართი + `/api`)
   - `NODE_VERSION` = `22`
4. **Save and Deploy**.

React Router-ის გვერდები (მაგ. `/wallet/top-up` პირდაპირ გახსნისას) Pages-ზე დამატებითი
კონფიგურაციის გარეშე მუშაობს — `404.html`-ის არქონისას Pages SPA-დ თვლის საიტს.

> თუ Pages-ის მისამართი `CORS_ORIGIN`-ში ჩაწერილისგან განსხვავდება (მაგ. `image-wallet-abc.pages.dev`),
> Render → Environment-ში შეასწორე `CORS_ORIGIN` — სერვისი თავად გადაიტვირთება.

## 5. SMS

Production-ში (`NODE_ENV=production`) კოდი ეკრანზე **არ** ჩანს. Twilio-ს გარეშე ტელეფონის
ვერიფიკაცია და top-up დაგიბრუნებს შეცდომას `SMS_NOT_CONFIGURED`.

Twilio-ს დასაყენებლად Render → Environment-ში შეავსე `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_FROM_NUMBER`. Trial ანგარიში SMS-ს მხოლოდ Twilio-ში verified ნომრებზე აგზავნის,
ხოლო Messaging → Settings → **Geo permissions**-ში საქართველო (+995) უნდა იყოს ჩართული.

## განახლება

`git push` → Render და Cloudflare Pages ავტომატურად ააწყობენ ახალ ვერსიას.
