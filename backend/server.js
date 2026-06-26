const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const OpenAI = require("openai");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Modul HTTP & Socket.io untuk Classroom Multiplayer Real-time
const http = require("http");
const { Server } = require("socket.io");

// Tambahan modul parser file & dokumen PDF untuk fitur unggah PDF
const fileUpload = require("express-fileupload");
const pdfParse = require("pdf-parse");

// Menentukan letak pasti file .env di dalam folder backend Anda
const envPath = path.resolve(__dirname, ".env");
const dotenvResult = require("dotenv").config({ path: envPath });

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "BRUTAL_QUIZ_SUPER_SECRET_KEY_123";

// Wrap Express App menggunakan Node HTTP Server agar bisa berjalan bersama Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Mengizinkan akses dari port frontend mana pun (lokal maupun cloud)
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Mengaktifkan middleware pengunggah file otomatis
app.use(
  fileUpload({
    limits: { fileSize: 10 * 1024 * 1024 }, // Batas ukuran maksimal file PDF: 10MB
    abortOnLimit: true,
    responseOnLimit:
      "Ukuran berkas PDF terlalu besar! Batas maksimal adalah 10MB.",
  }),
);

console.log(`========================================`);
console.log(`🔍 [DIAGNOSIS SISTEM]`);
console.log(`• Mencari file .env di: ${envPath}`);

if (dotenvResult.error) {
  console.log(`❌ GAGAL MEMBACA FILE .env! Error:`, dotenvResult.error.message);
} else {
  console.log(`✓ File .env berhasil terbaca oleh sistem.`);
}

const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI;
const envVarUsed = process.env.MONGO_URI
  ? "MONGO_URI"
  : process.env.MONGODB_URI
    ? "MONGODB_URI"
    : null;

if (!mongoURI) {
  console.log(
    `⚠️  PERINGATAN: Variabel "MONGO_URI" atau "MONGODB_URI" kosong or tidak ditemukan di file .env!`,
  );
} else {
  // Ambil bagian host saja untuk keamanan log
  const safeURI = mongoURI.replace(/:([^@]+)@/, ":****@");
  console.log(`✓ Mendeteksi ${envVarUsed} dari .env: ${safeURI}`);
}
console.log(`========================================`);

const finalMongoURI = mongoURI || "mongodb://127.0.0.1:27017/quiz_db";
const isAtlas = finalMongoURI.includes("mongodb+srv");

mongoose
  .connect(finalMongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log(
      `✓ KONEKSI SUKSES: Terhubung ke MongoDB ${isAtlas ? "Cloud Atlas ☁️" : "Lokal 💻"}!`,
    );
  })
  .catch((err) => {
    console.error(
      "✗ KONEKSI GAGAL: Terjadi kesalahan saat menghubungi MongoDB:",
      err.message,
    );
  });

// OpenAI Client Initialization
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

// --- DATABASE MODELS & SCHEMAS ---

// 1. Schema Pengguna (User)
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model("User", UserSchema);

// 2. Schema Materi (Material)
const MaterialSchema = new mongoose.Schema({
  name: { type: String, required: true },
  createdBy: { type: String, default: "Sistem AI" },
  createdAt: { type: Date, default: Date.now },
});
const Material = mongoose.model("Material", MaterialSchema);

// 3. Schema Pertanyaan (Question)
const QuestionSchema = new mongoose.Schema({
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Material",
    required: true,
  },
  questionText: { type: String, required: true },
  options: { type: [String], required: true },
  correctAnswerIndex: { type: Number, required: true, min: 0, max: 3 },
  batch: { type: Number },
  order: { type: Number },
});
const Question = mongoose.model("Question", QuestionSchema);

// 4. Schema Nilai / Laporan (Score)
const ScoreSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String, required: true },
  materialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Material",
    required: true,
  },
  materialName: { type: String, required: true },
  score: { type: Number, required: true },
  correctCount: { type: Number, default: 0 },
  incorrectCount: { type: Number, default: 0 },
  completedAt: { type: Date, default: Date.now },
});
const Score = mongoose.model("Score", ScoreSchema);

// --- SOCKET.IO REAL-TIME MULTIPLAYER CLASSROOM LOGIC ---

// Menyimpan data ruangan aktif di memori RAM server secara dinamis
const activeRooms = new Map();

io.on("connection", (socket) => {
  console.log(`🔌 Klien terhubung ke websocket: ${socket.id}`);

  // 1. Host membuat ruangan kelas baru untuk suatu kuis
  socket.on("create_room", async ({ materialId, hostName }) => {
    try {
      const roomId = Math.floor(100000 + Math.random() * 900000).toString(); // Membuat 6 digit PIN (contoh: 421098)
      const material = await Material.findById(materialId);

      if (!material) {
        socket.emit("room_error", "Materi kuis tidak ditemukan!");
        return;
      }

      // Ambil seluruh kumpulan soal dari database untuk ditaruh di sesi ruangan ini
      const questions = await Question.find({ materialId });
      if (questions.length === 0) {
        socket.emit("room_error", "Materi ini belum memiliki bank soal!");
        return;
      }

      // Pilih 10 soal acak dari bank soal
      const shuffledQuestions = questions
        .sort(() => 0.5 - Math.random())
        .slice(0, 10);

      // Inisialisasi struktur ruangan
      const roomData = {
        roomId,
        hostSocketId: socket.id,
        hostName,
        materialId,
        materialName: material.name,
        questions: shuffledQuestions,
        currentQuestionIndex: 0,
        players: [], // Daftar siswa { socketId, username, score, isAnswered }
        quizStarted: false,
      };

      activeRooms.set(roomId, roomData);
      socket.join(roomId);

      // Beritahu host bahwa pembuatan ruangan sukses
      socket.emit("room_created", { roomId, materialName: material.name });
      console.log(
        `🏆 Room kuis multiplayer berhasil dibuat: ${roomId} oleh Host: ${hostName}`,
      );
    } catch (err) {
      socket.emit("room_error", "Gagal merancang kelas multiplayer.");
    }
  });

  // 2. Siswa bergabung ke dalam ruangan menggunakan PIN/Room ID
  socket.on("join_room", ({ roomId, username }) => {
    const room = activeRooms.get(roomId);
    if (!room) {
      socket.emit("join_error", "PIN Ruangan tidak ditemukan atau salah!");
      return;
    }
    if (room.quizStarted) {
      socket.emit(
        "join_error",
        "Maaf, permainan kuis sudah terlanjur dimulai!",
      );
      return;
    }

    // Cek apakah username sudah ada di dalam ruangan
    const isExist = room.players.some(
      (p) => p.username.toLowerCase() === username.trim().toLowerCase(),
    );
    if (isExist) {
      socket.emit(
        "join_error",
        "Nama panggilan sudah digunakan oleh siswa lain!",
      );
      return;
    }

    // Masukkan siswa ke daftar player di ruangan
    const newPlayer = {
      socketId: socket.id,
      username: username.trim(),
      score: 0,
      isAnswered: false,
      correctCount: 0,
      incorrectCount: 0,
    };

    room.players.push(newPlayer);
    socket.join(roomId);

    // Kirim konfirmasi bergabung sukses ke siswa
    socket.emit("join_success", { roomId, materialName: room.materialName });

    // Update daftar seluruh nama siswa di lobby host secara real-time
    io.to(roomId).emit("players_update", room.players);
    console.log(`👤 Siswa [${username}] bergabung ke ruangan ${roomId}`);
  });

  // 3. Host menekan tombol "Mulai Game"
  socket.on("start_room_quiz", ({ roomId }) => {
    const room = activeRooms.get(roomId);
    if (room && socket.id === room.hostSocketId) {
      room.quizStarted = true;
      room.currentQuestionIndex = 0;

      // Broadcast ke seluruh siswa bahwa game dimulai & kirim soal pertama
      const firstQuestion = room.questions[0];
      io.to(roomId).emit("quiz_started", {
        totalQuestions: 10,
        materialName: room.materialName,
        question: {
          questionText: firstQuestion.questionText,
          options: firstQuestion.options,
          index: 0,
        },
      });
      console.log(
        `🏁 Game kuis di room ${roomId} telah dimulai secara serentak!`,
      );
    }
  });

  // 4. Siswa mengirimkan lembar jawaban mereka per nomor soal
  socket.on(
    "submit_room_answer",
    ({ roomId, username, selectedOptionIndex, timeLeft }) => {
      const room = activeRooms.get(roomId);
      if (!room) return;

      const player = room.players.find((p) => p.username === username);
      if (!player || player.isAnswered) return;

      const currentQuestion = room.questions[room.currentQuestionIndex];
      const isCorrect =
        selectedOptionIndex === currentQuestion.correctAnswerIndex;

      player.isAnswered = true;

      // Perhitungan skor Neobrutalism (+10 jika benar, -5 jika salah)
      if (isCorrect) {
        player.score += 10;
        player.correctCount += 1;
      } else {
        player.score -= 5;
        player.incorrectCount += 1;
      }

      // Kirim sinyal update ke ruangan agar host tahu siapa saja yang sudah menjawab
      io.to(roomId).emit("answer_submitted", {
        username,
        playersStatus: room.players.map((p) => ({
          username: p.username,
          isAnswered: p.isAnswered,
        })),
      });

      // Jika seluruh siswa sudah menjawab, kita pemicu otomatis tampilkan kunci jawaban
      const allAnswered = room.players.every((p) => p.isAnswered);
      if (allAnswered) {
        io.to(roomId).emit("show_correct_answer", {
          correctAnswerIndex: currentQuestion.correctAnswerIndex,
          leaderboard: [...room.players].sort((a, b) => b.score - a.score),
        });
      }
    },
  );

  // 5. Host menekan tombol "Lanjut ke Soal Berikutnya"
  socket.on("next_room_question", ({ roomId }) => {
    const room = activeRooms.get(roomId);
    if (!room || socket.id !== room.hostSocketId) return;

    // Reset status isAnswered setiap siswa untuk ronde baru
    room.players.forEach((p) => (p.isAnswered = false));

    room.currentQuestionIndex += 1;

    if (room.currentQuestionIndex < 10) {
      const nextQuestion = room.questions[room.currentQuestionIndex];
      io.to(roomId).emit("receive_next_question", {
        questionText: nextQuestion.questionText,
        options: nextQuestion.options,
        index: room.currentQuestionIndex,
      });
    } else {
      // Jika kuis telah mencapai 10 soal, selesaikan game kuis kelas secara megah!
      io.to(roomId).emit("room_quiz_finished", {
        finalLeaderboard: [...room.players].sort((a, b) => b.score - a.score),
      });

      // Hapus ruangan dari memori server agar RAM tetap efisien
      activeRooms.delete(roomId);
      console.log(`🏆 Room kuis kelas ${roomId} selesai dimainkan.`);
    }
  });

  // 6. Penanganan jika koneksi terputus (disconnect)
  socket.on("disconnect", () => {
    console.log(`🔌 Klien terputus dari server: ${socket.id}`);

    // Cari apakah yang terputus adalah siswa atau host dari suatu ruangan kuis
    for (const [roomId, room] of activeRooms.entries()) {
      if (room.hostSocketId === socket.id) {
        // Jika host yang keluar, bubarkan kuis secara otomatis
        io.to(roomId).emit(
          "room_closed",
          "Sesi kuis dihentikan karena guru/host meninggalkan ruangan.",
        );
        activeRooms.delete(roomId);
        console.log(`❌ Room ${roomId} dibubarkan karena Host keluar.`);
        break;
      } else {
        // Jika siswa yang keluar, hapus dari daftar dan update lobby
        const index = room.players.findIndex((p) => p.socketId === socket.id);
        if (index !== -1) {
          const removedPlayerName = room.players[index].username;
          room.players.splice(index, 1);
          io.to(roomId).emit("players_update", room.players);
          console.log(
            `👤 Siswa ${removedPlayerName} terputus dari room ${roomId}`,
          );
          break;
        }
      }
    }
  });
});

// --- API ENDPOINTS / ROUTES ---

// ================= AUTENTIKASI USER =================

// 1. API Registrasi Akun Baru (Sign Up)
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username dan Password wajib diisi!" });
    }

    const cleanUsername = username.trim();

    // Validasi apakah username sudah terdaftar
    const existingUser = await User.findOne({
      username: { $regex: new RegExp(`^${cleanUsername}$`, "i") },
    });
    if (existingUser) {
      return res
        .status(400)
        .json({ error: "Username sudah digunakan oleh orang lain!" });
    }

    // Hash/Enkripsi password menggunakan bcryptjs
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Simpan user baru ke database
    const newUser = new User({
      username: cleanUsername,
      password: hashedPassword,
    });
    await newUser.save();

    res.status(201).json({
      success: true,
      message: "Registrasi akun sukses! Silakan login.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mendaftarkan akun baru." });
  }
});

// 2. API Masuk Akun (Login)
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username dan Password wajib diisi!" });
    }

    const cleanUsername = username.trim();

    // Cari user di database
    const user = await User.findOne({ username: cleanUsername });
    if (!user) {
      return res.status(400).json({ error: "Username atau Password salah!" });
    }

    // Validasi kecocokan password terenkripsi
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Username atau Password salah!" });
    }

    // Buat token JWT untuk sesi masuk (aktif selama 7 hari)
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal melakukan proses login." });
  }
});

// ================= SISTEM UTAMA KUIS =================

// Mengambil seluruh materi dengan menghitung jumlah soal di database secara dinamis menggunakan Aggregation
app.get("/api/materials", async (req, res) => {
  try {
    const list = await Material.aggregate([
      {
        $lookup: {
          from: "questions", // mencocokkan ke collection questions
          localField: "_id",
          foreignField: "materialId",
          as: "questionsData",
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          createdBy: 1,
          createdAt: 1,
          questionCount: { $size: "$questionsData" }, // menghitung panjang array hasil matching
        },
      },
      { $sort: { createdAt: -1 } },
    ]);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil data materi." });
  }
});

// Dapatkan SEMUA soal dari suatu materi untuk diekspor/cetak fisik
app.get("/api/materials/:materialId/all-questions", async (req, res) => {
  try {
    const { materialId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(materialId)) {
      return res.status(400).json({ error: "ID Materi tidak valid." });
    }
    const questions = await Question.find({ materialId }).sort({ order: 1 });
    res.json(questions);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Gagal mengunduh kumpulan soal cetak kuis." });
  }
});

app.get("/api/quiz/:materialId", async (req, res) => {
  try {
    const { materialId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(materialId)) {
      return res.status(400).json({ error: "ID Materi tidak valid." });
    }

    const questions = await Question.find({ materialId });
    if (questions.length === 0) {
      return res
        .status(404)
        .json({ error: "Soal untuk materi ini belum siap atau kosong." });
    }

    const shuffled = questions.sort(() => 0.5 - Math.random());
    const selectedQuestions = shuffled.slice(0, 10);

    res.json(selectedQuestions);
  } catch (err) {
    res.status(500).json({ error: "Gagal merancang sesi kuis acak." });
  }
});

app.post("/api/scores", async (req, res) => {
  try {
    const {
      userId,
      username,
      materialId,
      materialName,
      score,
      correctCount,
      incorrectCount,
    } = req.body;

    if (!userId || !username || !materialId || !materialName) {
      return res
        .status(400)
        .json({ error: "Data kiriman skor tidak lengkap." });
    }

    const newScore = new Score({
      userId,
      username,
      materialId,
      materialName,
      score,
      correctCount,
      incorrectCount,
    });

    await newScore.save();
    res.json({ success: true, data: newScore });
  } catch (err) {
    res.status(500).json({ error: "Gagal menyimpan laporan skor ke MongoDB." });
  }
});

app.get("/api/scores", async (req, res) => {
  try {
    const leaderboard = await Score.find().sort({ score: -1, completedAt: -1 });
    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil laporan leaderboard." });
  }
});

// ================= AI ANALYZER: DETEKSI KELEMAHAN & FLASHCARDS =================

app.post("/api/quiz/analyze-weakness", async (req, res) => {
  try {
    const { wrongQuestions } = req.body;

    if (
      !wrongQuestions ||
      !Array.isArray(wrongQuestions) ||
      wrongQuestions.length === 0
    ) {
      return res.status(400).json({ error: "Daftar kesalahan soal kosong!" });
    }

    console.log(
      `🧠 AI menganalisis ${wrongQuestions.length} kesalahan siswa...`,
    );

    const prompt = `
      Anda adalah seorang asisten pendidik (tutor) kuis AI yang cerdas, empatik, dan taktis.
      Siswa baru saja menjawab kuis dan melakukan kesalahan pada pertanyaan-pertanyaan berikut:
      
      ${JSON.stringify(
        wrongQuestions.map((q) => ({
          pertanyaan: q.questionText,
          pilihanYangTersedia: q.options,
          jawabanSiswa:
            q.selectedAnswerIndex !== -1 && q.selectedAnswerIndex !== undefined
              ? q.options[q.selectedAnswerIndex]
              : "Waktu Habis",
          jawabanBenarSeharusnya: q.options[q.correctAnswerIndex],
        })),
      )}

      Tugas Anda adalah:
      1. Analisis pola kesalahpahaman atau kelemahan teori siswa tersebut.
      2. Buatlah TEPAT 3 kartu pintar (Flashcards) interaktif berbasis metode Active Recall.
      
      Format respons harus murni JSON objek tanpa tambahan pembuka/penjelas markdown di luarnya, dengan skema berikut:
      {
        "flashcards": [
          {
            "front": "Pertanyaan pemicu ingatan (Active Recall Question) yang tajam, menantang, dan berfokus pada inti materi yang salah.",
            "back": "Penjelasan teoretis konsep yang benar secara padat, ringkas, mudah dipahami (maksimal 2 kalimat), dan mencerahkan siswa agar langsung belajar dari kesalahannya."
          }
        ]
      }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const resultText = response.choices[0].message.content;
    const parsedData = JSON.parse(resultText);

    res.json(parsedData);
  } catch (err) {
    console.error("Gagal melakukan analisis kelemahan AI:", err);
    res.status(500).json({ error: "Gagal menyusun analisis kartu pintar." });
  }
});

// ================= AI GENERATOR (TEXT TOPIC) =================

app.post("/api/materials/generate", async (req, res) => {
  const { topicName, createdBy } = req.body;

  if (!topicName || !topicName.trim()) {
    return res.status(400).json({ error: "Topik materi wajib diisi!" });
  }

  try {
    const newMaterial = new Material({
      name: topicName.trim(),
      createdBy: createdBy || "Anonim",
    });
    const savedMaterial = await newMaterial.save();

    const subFocuses = [
      "Dasar dan Konsep Utama (Foundations & Core Concepts)",
      "Aplikasi Praktis dan Penerimaan Sintaksis (Practical Syntax & Application)",
      "Pemecahan Masalah dan Analisis Kasus (Debugging & Case Studies)",
      "Konsep Lanjutan dan Optimasi Performa (Advanced Optimization & Architecture)",
    ];

    let totalSaved = 0;
    const finalQuestions = [];

    for (let i = 0; i < 4; i++) {
      const focus = subFocuses[i];
      const prompt = `
        Buatlah tepat 25 soal pilihan ganda (MCQ) berbahasa Indonesia berkualitas tinggi mengenai materi: "${topicName.trim()}".
        Setiap soal HARUS memiliki tepat 4 pilihan jawaban yang kreatif (opsi distractor yang meyakinkan).
        
        Fokus khusus untuk Batch ini adalah: ${focus}.
        Pastikan semua pertanyaan relevan, jelas, tidak ambigu, dan mendidik.
        
        Format respons harus murni berbentuk JSON array sesuai dengan struktur schema di bawah ini tanpa markdown pembuka:
        [
          {
            "questionText": "Teks pertanyaan di sini",
            "options": ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D"],
            "correctAnswerIndex": 0
          }
        ]
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const responseText = response.choices[0].message.content;

      let dataParsed;
      try {
        const rawJson = JSON.parse(responseText);
        dataParsed = Array.isArray(rawJson)
          ? rawJson
          : rawJson.questions || Object.values(rawJson)[0];
      } catch (parseErr) {
        throw new Error(`Parsing JSON gagal pada Batch ${i + 1}`);
      }

      if (!Array.isArray(dataParsed)) {
        throw new Error(`Format respons Batch ${i + 1} tidak berupa array.`);
      }

      const mappedQuestions = dataParsed.slice(0, 25).map((q, index) => ({
        materialId: savedMaterial._id,
        questionText: q.questionText,
        options: q.options.slice(0, 4),
        correctAnswerIndex: Math.min(
          Math.max(0, parseInt(q.correctAnswerIndex) || 0),
          3,
        ),
        batch: i + 1,
        order: i * 25 + index + 1,
      }));

      await Question.insertMany(mappedQuestions);
      totalSaved += mappedQuestions.length;
      finalQuestions.push(...mappedQuestions);
    }

    res.json({
      success: true,
      materialId: savedMaterial._id,
      materialName: savedMaterial.name,
      totalQuestionsGenerated: totalSaved,
    });
  } catch (err) {
    console.error("Proses AI gagal:", err);
    res
      .status(500)
      .json({ error: `Terjadi kegagalan AI Generator: ${err.message}` });
  }
});

// ================= AI GENERATOR (PDF UPLOAD) =================

app.post("/api/materials/generate-pdf", async (req, res) => {
  try {
    // 1. Memeriksa apakah file PDF terunggah
    if (!req.files || !req.files.pdfFile) {
      return res.status(400).json({
        error:
          "Gagal memproses unggahan, silakan pilih berkas PDF materi Anda terlebih dahulu.",
      });
    }

    const { topicName, createdBy } = req.body;
    if (!topicName || !topicName.trim()) {
      return res
        .status(400)
        .json({ error: "Nama materi pelajaran (Topik) wajib diisi!" });
    }

    const pdfFile = req.files.pdfFile;

    // Validasi tipe file agar benar-benar PDF
    if (pdfFile.mimetype !== "application/pdf") {
      return res.status(400).json({
        error: "Berkas yang Anda unggah bukan format PDF yang valid!",
      });
    }

    console.log(
      `📄 Memulai ekstraksi dokumen PDF: ${pdfFile.name} (${pdfFile.size} bytes)`,
    );

    // 2. Ekstrak teks mentah dari binary buffer PDF menggunakan pdf-parse
    const pdfData = await pdfParse(pdfFile.data);
    const extractedText = pdfData.text;

    if (!extractedText || extractedText.trim().length < 100) {
      return res.status(400).json({
        error:
          "Sistem gagal membaca dokumen PDF atau teks di dalam berkas PDF terlalu pendek untuk dibuat kuis kualitatif.",
      });
    }

    console.log(
      `✓ Ekstraksi teks PDF sukses! Terbaca ${extractedText.length} karakter.`,
    );

    // 3. Batasi karakter teks untuk dikirim ke API OpenAI demi menghemat token & menjaga kecepatan respons
    // Batas aman karakter: 15.000 karakter pertama (setara ~3.000 kata)
    const truncatedText = extractedText.substring(0, 15000);

    // 4. Daftarkan materi baru di database MongoDB
    const newMaterial = new Material({
      name: topicName.trim(),
      createdBy: createdBy || "Sistem AI PDF",
    });
    const savedMaterial = await newMaterial.save();

    // 5. Susun segmentasi fokus akademis untuk 4 batch buatan AI
    const subFocuses = [
      "Fakta Dasar, Definisi Penting, dan Klasifikasi utama berdasarkan teks.",
      "Hubungan Sebab-Akibat, Fungsi, dan Aturan yang tertulis di dalam teks.",
      "Contoh Kasus, Analisis Pemecahan Masalah, dan Skenario Aplikasi dari teks.",
      "Pertanyaan kritis tingkat tinggi (HOTS) serta Kesimpulan Teori dari teks.",
    ];

    let totalSaved = 0;
    const finalQuestions = [];

    // Loop 4 kali demi menghasilkan tepat 100 soal (masing-masing batch 25 soal secara beralur)
    for (let i = 0; i < 4; i++) {
      console.log(
        `🤖 Menghubungi OpenAI untuk merancang Soal PDF Batch ${i + 1}/4...`,
      );
      const focus = subFocuses[i];

      const prompt = `
        Anda adalah seorang asisten pendidik ahli pembuat soal ujian sekolah bersertifikasi.
        Tugas utama Anda adalah membuat TEPAT 25 soal pilihan ganda (MCQ) berkualitas tinggi dan mendalam dengan bahasa Indonesia yang baku, rapi, dan mudah dipahami.
        
        PENTING: Seluruh soal yang Anda rancang HARUS murni bersumber dari materi teks dokumen PDF berikut ini:
        
        --- AWAL DOKUMEN ---
        ${truncatedText}
        --- AKHIR DOKUMEN ---

        Fokus kriteria penyusunan soal pada Batch ${i + 1}/4 ini adalah: ${focus}.
        Pilihan jawaban harus berjumlah tepat 4 opsi (A, B, C, D) yang memiliki distractor (opsi salah) yang sangat masuk akal, logis, dan menantang bagi siswa.
        
        Format respons harus murni berbentuk JSON array tanpa embel-embel markdown, pembuka, atau penjelasan tambahan di luar JSON:
        [
          {
            "questionText": "Teks pertanyaan di sini",
            "options": ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D"],
            "correctAnswerIndex": 0
          }
        ]
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const responseText = response.choices[0].message.content;

      let dataParsed;
      try {
        const rawJson = JSON.parse(responseText);
        dataParsed = Array.isArray(rawJson)
          ? rawJson
          : rawJson.questions || Object.values(rawJson)[0];
      } catch (parseErr) {
        throw new Error(
          `Gagal membaca struktur respons JSON OpenAI pada Batch ${i + 1}`,
        );
      }

      if (!Array.isArray(dataParsed)) {
        throw new Error(
          `Format respons dari AI pada Batch ${i + 1} tidak berupa list/array.`,
        );
      }

      // Format dan validasi setiap soal sebelum di-input ke MongoDB
      const mappedQuestions = dataParsed.slice(0, 25).map((q, index) => ({
        materialId: savedMaterial._id,
        questionText: q.questionText,
        options: q.options.slice(0, 4),
        correctAnswerIndex: Math.min(
          Math.max(0, parseInt(q.correctAnswerIndex) || 0),
          3,
        ),
        batch: i + 1,
        order: i * 25 + index + 1,
      }));

      // Taruh seluruh soal batch ini ke MongoDB
      await Question.insertMany(mappedQuestions);
      totalSaved += mappedQuestions.length;
      finalQuestions.push(...mappedQuestions);
    }

    console.log(
      `✓ Sukses! Berhasil memetakan dan menyimpan ${totalSaved} Soal PDF ke MongoDB.`,
    );

    res.json({
      success: true,
      materialId: savedMaterial._id,
      materialName: savedMaterial.name,
      totalQuestionsGenerated: totalSaved,
    });
  } catch (err) {
    console.error("Proses Ekstraksi & Generasi PDF gagal:", err);
    res
      .status(500)
      .json({ error: `Kegagalan Generator AI PDF: ${err.message}` });
  }
});

// Menjalankan Server (Menggunakan 'server.listen' bukan 'app.listen' agar socket.io aktif)
server.listen(PORT, () => {
  console.log(`========================================`);
  console.log(` 🚀 SERVER AKTIF DI PORT: ${PORT}`);
  console.log(` • Socket.io Engine: Aktif & Siap Mabar!`);
  console.log(` • PDF Upload Parser Engine: Aktif!`);
  console.log(`========================================`);
});
