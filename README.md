# QUIZ

Aplikasi kuis fullstack berbasis **React + Vite** di frontend dan **Express + MongoDB + Socket.io + OpenAI** di backend.

Fitur utama:

- login dan registrasi user
- kuis solo
- multiplayer room dengan PIN
- leaderboard
- AI generator soal dari topik teks
- AI generator soal dari PDF
- analisis kelemahan jawaban dan flashcards

## Teknologi

- Frontend: React, Vite, Tailwind CSS, Socket.io client
- Backend: Node.js, Express, MongoDB, Socket.io
- AI: OpenAI API

## Prasyarat

Pastikan sudah terpasang:

- Node.js 18+
- MongoDB lokal atau MongoDB Atlas
- API key OpenAI jika ingin fitur AI generator aktif

## Struktur Project

```text
QUIZ/
|-- backend/
|-- frontend/
|-- .gitignore
`-- README.md
```

## Setup

### 1. Install dependency

Jalankan per folder:

```bash
cd backend
npm install
```

```bash
cd frontend
npm install
```

Kalau mau dari root:

```bash
npm install
```

Lalu tetap install dependency di `backend` dan `frontend` karena masing-masing punya `package.json` sendiri.

### 2. Buat file environment backend

Buat file ini:

```text
backend/.env
```

Isi contoh:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/quiz_db
JWT_SECRET=isi_dengan_secret_anda
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
```

Catatan:

- `MONGO_URI` bisa diganti ke MongoDB Atlas
- `OPENAI_API_KEY` wajib diisi kalau ingin pakai fitur AI generator
- `JWT_SECRET` sebaiknya diganti dengan string yang kuat

## Cara Menjalankan

### Backend

```bash
cd backend
npm run dev
```

Backend akan jalan di:

```text
http://localhost:5000
```

### Frontend

```bash
cd frontend
npm run dev
```

Frontend Vite akan jalan di:

```text
http://localhost:3000
```

## Cara Pakai

### 1. Registrasi dan login

1. Buka frontend di browser.
2. Buat akun baru lewat menu register.
3. Login menggunakan username dan password yang sudah dibuat.

### 2. Main kuis solo

1. Masuk ke tab kuis.
2. Pilih materi yang tersedia.
3. Jawab soal satu per satu.
4. Skor akan dihitung otomatis.
5. Hasil dan leaderboard akan tersimpan ke MongoDB.

### 3. Multiplayer room

1. Login sebagai host.
2. Pilih materi lalu buat room.
3. Sistem akan membuat PIN room.
4. Bagikan PIN ke pemain lain.
5. Pemain masuk ke room memakai PIN tersebut.
6. Host menekan tombol mulai.
7. Pemain menjawab soal secara real-time.

### 4. AI Generator dari topik teks

1. Masuk ke tab AI Generator.
2. Pilih mode berdasarkan topik teks.
3. Isi nama materi/topik.
4. Kirim form.
5. Backend akan membuat 100 soal otomatis dan menyimpannya ke database.

### 5. AI Generator dari PDF

1. Masuk ke tab AI Generator.
2. Pilih mode berdasarkan upload PDF.
3. Isi nama materi/topik.
4. Upload file PDF.
5. Kirim form.
6. Sistem akan mengekstrak isi PDF lalu membuat 100 soal otomatis.

Syarat PDF:

- format harus `.pdf`
- ukuran maksimal 10 MB
- teks di dalam PDF sebaiknya bisa dibaca, bukan hasil scan buram

### 6. Leaderboard

1. Buka tab leaderboard.
2. Lihat daftar skor semua user yang sudah menyelesaikan kuis.

## Konfigurasi API Frontend

Frontend secara default memakai API backend:

```text
http://localhost:5000/api
```

Kalau backend dijalankan di alamat lain, buka tab konfigurasi API di aplikasi lalu ubah URL-nya.

Contoh:

```text
https://domain-anda.com/api
```

## API Ringkas

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`

### Materi

- `GET /api/materials`
- `GET /api/materials/:materialId/all-questions`
- `GET /api/quiz/:materialId`
- `POST /api/materials/generate`
- `POST /api/materials/generate-pdf`

### Skor

- `POST /api/scores`
- `GET /api/scores`

### Analisis AI

- `POST /api/quiz/analyze-weakness`

## Socket Events Multiplayer

Event utama yang dipakai:

- `create_room`
- `join_room`
- `start_room_quiz`
- `submit_room_answer`
- `next_room_question`

Event balasan:

- `room_created`
- `join_success`
- `room_error`
- `join_error`
- `players_update`
- `quiz_started`
- `answer_submitted`
- `show_correct_answer`
- `receive_next_question`
- `room_quiz_finished`
- `room_closed`

## Troubleshooting

### Backend tidak konek ke MongoDB

- cek `MONGO_URI` di `backend/.env`
- pastikan MongoDB lokal sedang berjalan
- kalau pakai Atlas, pastikan IP sudah di-whitelist

### Fitur AI tidak jalan

- cek `OPENAI_API_KEY`
- pastikan billing / akses API OpenAI aktif

### Frontend tidak bisa ambil data

- pastikan backend jalan di port `5000`
- pastikan `apiBaseUrl` di frontend benar

### Multiplayer tidak sinkron

- pastikan semua user terhubung ke backend yang sama
- pastikan socket server aktif dan tidak ada firewall yang memblokir

## Catatan

- `node_modules/` tidak perlu di-commit
- file `backend/.env` jangan diunggah ke repo publik
- saat mode development, jalankan backend dan frontend di dua terminal terpisah

## Lisensi

Belum ditentukan.
