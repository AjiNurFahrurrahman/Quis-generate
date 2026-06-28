import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Play,
  Check,
  X,
  Award,
  BookOpen,
  Sparkles,
  Timer,
  User,
  Plus,
  Database,
  Info,
  ChevronRight,
  Layers,
  Download,
  Loader2,
  AlertTriangle,
  Lock,
  LogOut,
  UserPlus,
  Wifi,
  WifiOff,
  Users,
  Tv,
  Crown,
  Key,
  ShieldAlert,
  Zap,
  UploadCloud,
  FileText,
} from "lucide-react";
import { io } from "socket.io-client";

export default function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(() => {
    return (
      localStorage.getItem("quiz_api_url") ||
      "https://quis-generate-production.up.railway.app/api"
    );
  });

  // Authentication & Session States
  const [token, setToken] = useState(localStorage.getItem("quiz_token") || "");
  const [username, setUsername] = useState(
    localStorage.getItem("quiz_username") || "",
  );
  const [userId, setUserId] = useState(
    localStorage.getItem("quiz_user_id") || "",
  );
  const [userRole, setUserRole] = useState(
    localStorage.getItem("quiz_user_role") || "student",
  );
  const [quizEndedByCheat, setQuizEndedByCheat] = useState(false);

  // Auth Form Input States
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Connection ping indicator
  const [isServerOnline, setIsServerOnline] = useState(false);

  // App Navigation & Screens
  const [currentTab, setCurrentTab] = useState("quiz"); // 'quiz' | 'multiplayer' | 'generator' | 'leaderboard' | 'export'
  const [selectedMaterial, setSelectedMaterial] = useState(null);

  // Sync data states from MongoDB backend
  const [materials, setMaterials] = useState([]);
  const [allScores, setAllScores] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [errorStatus, setErrorStatus] = useState(null);

  // Custom Toast System (Replacing illegal alert calls)
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "info",
  });

  // AI Generator States
  const [topicName, setTopicName] = useState("");
  const [generatorMode, setGeneratorMode] = useState("text"); // 'text' | 'pdf'
  const [pdfFile, setPdfFile] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationLogs, setGenerationLogs] = useState([]);

  // Active Solo Quiz Play State
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [quizCorrectCount, setQuizCorrectCount] = useState(0);
  const [quizIncorrectCount, setQuizIncorrectCount] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20); // 20 seconds per question

  // List of wrong answers to send for AI Weakness analysis
  const [wrongAnswersHistory, setWrongAnswersHistory] = useState([]);
  const [answerHistory, setAnswerHistory] = useState([]); // riwayat SEMUA jawaban (benar & salah) untuk panel "Hasil Exam"
  const [flashcards, setFlashcards] = useState([]);
  const [loadingFlashcards, setLoadingFlashcards] = useState(false);
  const [flippedCards, setFlippedCards] = useState({}); // state to track flip cards { cardIndex: boolean }

  // Printable Exam State (Blank Sheet)
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [printMaterialName, setPrintMaterialName] = useState("");
  const [printQuestions, setPrintQuestions] = useState([]);
  const [loadingPrint, setLoadingPrint] = useState(false);

  // Printable Quiz Result State (Sertifikat / Laporan Hasil)
  const [isPrintResultMode, setIsPrintResultMode] = useState(false);
  const [printResultData, setPrintResultData] = useState(null);

  const timerRef = useRef(null);

  // Multiplayer Socket States
  const socketRef = useRef(null);
  const [mpRole, setMpRole] = useState(null); // 'host' | 'player' | null
  const [mpRoomId, setMpRoomId] = useState("");
  const [mpRoomIdInput, setMpRoomIdInput] = useState("");
  const [mpError, setMpError] = useState("");
  const [mpLobbyPlayers, setMpLobbyPlayers] = useState([]);
  const [mpMaterialName, setMpMaterialName] = useState("");
  const [mpQuizStarted, setMpQuizStarted] = useState(false);

  // Real-time active active quiz state for multiplayer
  const [mpCurrentQuestion, setMpCurrentQuestion] = useState(null);
  const [mpCurrentQuestionIndex, setMpCurrentQuestionIndex] = useState(0);
  const [mpSelectedOptionIndex, setMpSelectedOptionIndex] = useState(null);
  const [mpHasAnswered, setMpHasAnswered] = useState(false);
  const [mpShowCorrectAnswer, setMpShowCorrectAnswer] = useState(false);
  const [mpCorrectAnswerIndex, setMpCorrectAnswerIndex] = useState(null);
  const [mpRealtimeLeaderboard, setMpRealtimeLeaderboard] = useState([]);
  const [mpGameFinished, setMpGameFinished] = useState(false);
  const [mpFinalLeaderboard, setMpFinalLeaderboard] = useState([]);

  const showNotification = (message, type = "info") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 4000);
  };

  // Gamification Level and XP calculations
  const userXP = useMemo(() => {
    const userScores = allScores.filter((s) => s.username === username);
    const totalScore = userScores.reduce(
      (acc, curr) => acc + (curr.score || 0),
      0,
    );
    return Math.max(0, totalScore);
  }, [allScores, username]);

  const userLevel = useMemo(() => {
    return Math.floor(userXP / 100) + 1;
  }, [userXP]);

  const xpProgress = useMemo(() => {
    return userXP % 100;
  }, [userXP]);

  useEffect(() => {
    pingServer();
    if (token) {
      fetchMaterials();
      fetchScores();
    }
  }, [token, apiBaseUrl]);

  useEffect(() => {
    if (!token) return;

    const socketUrl = apiBaseUrl.replace("/api", "");
    socketRef.current = io(socketUrl, { autoConnect: false });

    socketRef.current.on("connect", () => {
      console.log("✓ Terhubung ke WebSocket Server!");
    });

    socketRef.current.on("room_created", ({ roomId, materialName }) => {
      setMpRoomId(roomId);
      setMpMaterialName(materialName);
      setMpRole("host");
      setMpError("");
    });

    socketRef.current.on("join_success", ({ roomId, materialName }) => {
      setMpRoomId(roomId);
      setMpMaterialName(materialName);
      setMpRole("player");
      setMpError("");
    });

    socketRef.current.on("room_error", (msg) => {
      setMpError(msg);
      setMpRole(null);
    });

    socketRef.current.on("join_error", (msg) => {
      setMpError(msg);
      setMpRole(null);
    });

    socketRef.current.on("players_update", (players) => {
      setMpLobbyPlayers(players);
    });

    socketRef.current.on("quiz_started", ({ question }) => {
      setMpQuizStarted(true);
      setMpCurrentQuestion(question);
      setMpCurrentQuestionIndex(0);
      setMpHasAnswered(false);
      setMpSelectedOptionIndex(null);
      setMpShowCorrectAnswer(false);
    });

    socketRef.current.on("answer_submitted", ({ playersStatus }) => {
      setMpLobbyPlayers((prev) => {
        return prev.map((p) => {
          const updated = playersStatus.find((u) => u.username === p.username);
          return updated ? { ...p, isAnswered: updated.isAnswered } : p;
        });
      });
    });

    socketRef.current.on(
      "show_correct_answer",
      ({ correctAnswerIndex, leaderboard }) => {
        setMpCorrectAnswerIndex(correctAnswerIndex);
        setMpShowCorrectAnswer(true);
        setMpRealtimeLeaderboard(leaderboard);
      },
    );

    socketRef.current.on(
      "receive_next_question",
      ({ questionText, options, index }) => {
        setMpCurrentQuestion({ questionText, options, index });
        setMpCurrentQuestionIndex(index);
        setMpHasAnswered(false);
        setMpSelectedOptionIndex(null);
        setMpShowCorrectAnswer(false);
      },
    );

    socketRef.current.on("room_quiz_finished", ({ finalLeaderboard }) => {
      setMpGameFinished(true);
      setMpFinalLeaderboard(finalLeaderboard);
    });

    socketRef.current.on("room_closed", (msg) => {
      // REPLACED ILLEGAL ALERT WITH TOAST BANNER
      showNotification(msg, "info");
      resetMultiplayerState();
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [token, apiBaseUrl]);

  const pingServer = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/materials`, {
        method: "GET",
      });
      if (response.ok) {
        setIsServerOnline(true);
      } else {
        setIsServerOnline(false);
      }
    } catch {
      setIsServerOnline(false);
    }
  };

  const fetchMaterials = async () => {
    setErrorStatus(null);
    setLoadingData(true);
    try {
      const response = await fetch(`${apiBaseUrl}/materials`);
      if (!response.ok) throw new Error("Gagal mengunduh daftar materi.");
      const data = await response.json();
      setMaterials(data);
      setIsServerOnline(true);
    } catch (err) {
      setIsServerOnline(false);
      setErrorStatus(
        "Tidak dapat terhubung ke server backend lokal (Port 5000).",
      );
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  };

  const fetchScores = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/scores`);
      if (!response.ok) throw new Error("Gagal mengambil data skor.");
      const data = await response.json();
      setAllScores(data);
    } catch (err) {
      console.error("Gagal sinkronisasi leaderboard:", err);
    }
  };

  useEffect(() => {
    if (
      currentTab === "quiz" &&
      selectedMaterial &&
      !quizFinished &&
      quizQuestions.length > 0
    ) {
      if (timerRef.current) clearInterval(timerRef.current);

      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            handleTimeout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [
    currentTab,
    selectedMaterial,
    currentQuestionIdx,
    quizFinished,
    quizQuestions,
  ]);

  // Anti-cheat: quiz selesai otomatis jika user pindah tab/window
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.hidden &&
        currentTab === "quiz" &&
        selectedMaterial &&
        !quizFinished &&
        quizQuestions.length > 0
      ) {
        if (timerRef.current) clearInterval(timerRef.current);
        setQuizEndedByCheat(true);
        setQuizFinished(true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentTab, selectedMaterial, quizFinished, quizQuestions]);

  const handleTimeout = () => {
    const wrongQ = quizQuestions[currentQuestionIdx];
    setWrongAnswersHistory((prev) => [
      ...prev,
      { ...wrongQ, selectedAnswerIndex: -1 },
    ]);
    setAnswerHistory((prev) => [
      ...prev,
      {
        questionText: wrongQ.questionText,
        options: wrongQ.options,
        correctAnswerIndex: wrongQ.correctAnswerIndex,
        selectedAnswerIndex: -1,
        isCorrect: false,
        category: wrongQ.category || selectedMaterial?.name || "Umum",
      },
    ]);

    setHasAnswered(true);
    setSelectedAnswer(-1);
    // Waktu habis: tidak dapat nilai, tapi skor tidak berkurang
    setQuizIncorrectCount((prev) => prev + 1);
  };

  const resetMultiplayerState = () => {
    setMpRole(null);
    setMpRoomId("");
    setMpRoomIdInput("");
    setMpError("");
    setMpLobbyPlayers([]);
    setMpMaterialName("");
    setMpQuizStarted(false);
    setMpCurrentQuestion(null);
    setMpGameFinished(false);
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  };

  const handleCreateRoom = (materialId) => {
    setMpError("");
    if (!socketRef.current.connected) {
      socketRef.current.connect();
    }
    socketRef.current.emit("create_room", { materialId, hostName: username });
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    setMpError("");
    if (!mpRoomIdInput.trim()) {
      setMpError("PIN Ruangan tidak boleh kosong!");
      return;
    }
    if (!socketRef.current.connected) {
      socketRef.current.connect();
    }
    socketRef.current.emit("join_room", {
      roomId: mpRoomIdInput.trim(),
      username,
    });
  };

  const handleStartMpQuiz = () => {
    if (mpRole === "host" && mpRoomId) {
      socketRef.current.emit("start_room_quiz", { roomId: mpRoomId });
    }
  };

  const handleMpAnswerSubmit = (optionIndex) => {
    if (mpHasAnswered || mpShowCorrectAnswer) return;
    setMpSelectedOptionIndex(optionIndex);
    setMpHasAnswered(true);

    socketRef.current.emit("submit_room_answer", {
      roomId: mpRoomId,
      username,
      selectedOptionIndex: optionIndex,
    });
  };

  const handleNextMpQuestion = () => {
    if (mpRole === "host" && mpRoomId) {
      socketRef.current.emit("next_room_question", { roomId: mpRoomId });
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);

    const endpoint = isRegisterMode ? "/auth/register" : "/auth/login";
    const payload = { username: authUsername.trim(), password: authPassword };

    try {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Terjadi kesalahan sistem autentikasi.");
      }

      if (isRegisterMode) {
        setAuthSuccess("✓ Pendaftaran Akun Sukses! Silakan login.");
        setIsRegisterMode(false);
        setAuthPassword("");
      } else {
        localStorage.setItem("quiz_token", data.token);
        localStorage.setItem("quiz_username", data.user.username);
        localStorage.setItem("quiz_user_id", data.user.id);
        localStorage.setItem("quiz_user_role", data.user.role || "student");

        setToken(data.token);
        setUsername(data.user.username);
        setUserId(data.user.id);
        setUserRole(data.user.role || "student");

        setAuthUsername("");
        setAuthPassword("");
      }
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("quiz_token");
    localStorage.removeItem("quiz_username");
    localStorage.removeItem("quiz_user_id");
    localStorage.removeItem("quiz_user_role");

    setToken("");
    setUsername("");
    setUserId("");
    setUserRole("student");
    quitQuiz();
    resetMultiplayerState();
  };

  const saveCustomApiUrl = (newUrl) => {
    const trimmed = newUrl.trim();
    setApiBaseUrl(trimmed);
    localStorage.setItem("quiz_api_url", trimmed);
  };

  const handleGenerateMaterial = async (e) => {
    e.preventDefault();
    if (!topicName.trim() || isGenerating) return;

    setIsGenerating(true);
    setGenerationLogs([
      "Menghubungi server backend Anda...",
      "Memulai request GPT-4o-mini via backend...",
    ]);

    try {
      setGenerationLogs((prev) => [
        ...prev,
        "Sedang menyusun dan merancang 100 soal kuis...",
        "Harap bersabar, proses batching 4x25 membutuhkan sekitar 15-30 detik.",
      ]);

      const response = await fetch(`${apiBaseUrl}/materials/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicName: topicName.trim(),
          createdBy: username,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Gagal meng-generate soal.");
      }

      setGenerationLogs((prev) => [
        ...prev,
        "✓ 100 Soal berhasil digenerasi dengan sempurna!",
        "Menyimpan ke database cloud MongoDB Atlas...",
        "Selesai! Menuju lobi kuis...",
      ]);

      setTopicName("");
      await fetchMaterials();

      setTimeout(() => {
        setIsGenerating(false);
        setCurrentTab("quiz");
      }, 2000);
    } catch (err) {
      setGenerationLogs((prev) => [
        ...prev,
        `❌ Error Terjadi: ${err.message}`,
      ]);
      setTimeout(() => {
        setIsGenerating(false);
      }, 5000);
    }
  };

  const handleGeneratePdfMaterial = async (e) => {
    e.preventDefault();
    if (!topicName.trim() || !pdfFile || isGenerating) return;

    setIsGenerating(true);
    setGenerationLogs([
      "Menghubungi server backend Anda...",
      "Mempersiapkan pengunggahan file PDF...",
      `Membaca berkas: ${pdfFile.name} (${(pdfFile.size / 1024 / 1024).toFixed(2)} MB)`,
    ]);

    try {
      const formData = new FormData();
      formData.append("pdfFile", pdfFile);
      formData.append("topicName", topicName.trim());
      formData.append("createdBy", username);

      setGenerationLogs((prev) => [
        ...prev,
        "Sedang mengunggah berkas PDF dan memanggil kecerdasan buatan...",
        "Harap tunggu, proses ekstraksi teks & perancangan 100 soal (4 batch) memakan waktu 15-35 detik...",
      ]);

      const response = await fetch(`${apiBaseUrl}/materials/generate-pdf`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Gagal membuat kuis otomatis dari berkas PDF.",
        );
      }

      setGenerationLogs((prev) => [
        ...prev,
        "✓ 100 Soal PDF berhasil dianalisis & disimpan ke MongoDB!",
        "Materi baru siap dimainkan.",
        "Merarahkan ke lobi kuis...",
      ]);

      setTopicName("");
      setPdfFile(null);
      await fetchMaterials();

      setTimeout(() => {
        setIsGenerating(false);
        setCurrentTab("quiz");
      }, 2000);
    } catch (err) {
      setGenerationLogs((prev) => [...prev, `❌ Gagal: ${err.message}`]);
      setTimeout(() => {
        setIsGenerating(false);
      }, 6000);
    }
  };

  const startQuiz = async (material) => {
    setLoadingData(true);
    setErrorStatus(null);
    setWrongAnswersHistory([]);
    setAnswerHistory([]);
    setFlippedCards({});

    try {
      const response = await fetch(
        `${apiBaseUrl}/quiz/${material.id || material._id}`,
      );
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Gagal mengunduh soal kuis.");
      }
      const questions = await response.json();

      setSelectedMaterial(material);
      setQuizQuestions(questions);
      setCurrentQuestionIdx(0);
      setSelectedAnswer(null);
      setHasAnswered(false);
      setQuizScore(0);
      setQuizCorrectCount(0);
      setQuizIncorrectCount(0);
      setQuizFinished(false);
      setTimeLeft(20);
    } catch (err) {
      setErrorStatus(err.message);
    } finally {
      setLoadingData(false);
    }
  };

  const handleAnswerClick = (optionIndex) => {
    if (hasAnswered) return;

    if (timerRef.current) clearInterval(timerRef.current);

    setSelectedAnswer(optionIndex);
    setHasAnswered(true);

    const activeQ = quizQuestions[currentQuestionIdx];
    const correctIdx = activeQ.correctAnswerIndex;

    setAnswerHistory((prev) => [
      ...prev,
      {
        questionText: activeQ.questionText,
        options: activeQ.options,
        correctAnswerIndex: correctIdx,
        selectedAnswerIndex: optionIndex,
        isCorrect: optionIndex === correctIdx,
        category: activeQ.category || selectedMaterial?.name || "Umum",
      },
    ]);

    if (optionIndex === correctIdx) {
      setQuizScore((prev) => prev + 10);
      setQuizCorrectCount((prev) => prev + 1);
    } else {
      setWrongAnswersHistory((prev) => [
        ...prev,
        { ...activeQ, selectedAnswerIndex: optionIndex },
      ]);
      // Jawaban salah: tidak dapat nilai, tapi skor tidak berkurang
      setQuizIncorrectCount((prev) => prev + 1);
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIdx < 9) {
      setCurrentQuestionIdx((prev) => prev + 1);
      setSelectedAnswer(null);
      setHasAnswered(false);
      setTimeLeft(20);
    } else {
      finishQuiz();
    }
  };

  const analyzeWeaknessWithAI = async (wrongAnswersList) => {
    if (wrongAnswersList.length === 0) return;
    setLoadingFlashcards(true);
    try {
      const response = await fetch(`${apiBaseUrl}/quiz/analyze-weakness`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wrongQuestions: wrongAnswersList }),
      });
      if (!response.ok) throw new Error("Gagal menganalisis kelemahan.");
      const result = await response.json();
      setFlashcards(result.flashcards || []);
    } catch (err) {
      console.error("Gagal memanggil AI Analisis:", err);
    } finally {
      setLoadingFlashcards(false);
    }
  };

  const finishQuiz = async () => {
    setQuizFinished(true);
    if (timerRef.current) clearInterval(timerRef.current);

    // Kirim data nilai ke backend
    try {
      const response = await fetch(`${apiBaseUrl}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId,
          username: username,
          materialId: selectedMaterial.id || selectedMaterial._id,
          materialName: selectedMaterial.name,
          score: quizScore,
          correctCount: quizCorrectCount,
          incorrectCount: quizIncorrectCount,
        }),
      });

      if (response.ok) {
        fetchScores();
      }
    } catch (err) {
      console.error("Gagal mengirim data skor ke database:", err);
    }

    // Panggil analisis kelemahan AI jika ada soal yang salah
    if (
      wrongAnswersHistory.length > 0 ||
      selectedAnswer !== quizQuestions[currentQuestionIdx]?.correctAnswerIndex
    ) {
      let latestWrong = [...wrongAnswersHistory];
      const lastCorrectIdx =
        quizQuestions[currentQuestionIdx]?.correctAnswerIndex;
      if (
        selectedAnswer !== lastCorrectIdx &&
        !latestWrong.some(
          (q) =>
            q.questionText === quizQuestions[currentQuestionIdx]?.questionText,
        )
      ) {
        latestWrong.push({
          ...quizQuestions[currentQuestionIdx],
          selectedAnswerIndex: selectedAnswer,
        });
      }
      analyzeWeaknessWithAI(latestWrong);
    }
  };

  const handlePrintExamLoad = async (material) => {
    setLoadingPrint(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/materials/${material.id || material._id}/all-questions`,
      );
      if (!response.ok)
        throw new Error("Gagal mengunduh semua bank soal kuis.");
      const questionsList = await response.json();
      setPrintMaterialName(material.name);
      setPrintQuestions(questionsList);
      setIsPrintMode(true);
    } catch (err) {
      // REPLACED ILLEGAL ALERT WITH TOAST BANNER
      showNotification("Gagal memuat kuis: " + err.message, "error");
    } finally {
      setLoadingPrint(false);
    }
  };

  const handlePrintResultLoad = () => {
    const totalSoal = quizQuestions.length;
    // Skor baru: per soal benar = 1, salah = 0, dijumlahkan (maksimal = totalSoal)
    const examScore = quizCorrectCount;
    // Persentase ketuntasan tetap dihitung di belakang layar untuk menentukan lulus/tidak
    const accuracyPercentage =
      totalSoal > 0 ? Math.round((quizCorrectCount / totalSoal) * 100) : 0;

    setPrintResultData({
      username: username || "NeoPlayer",
      materialName: selectedMaterial.name,
      score: quizScore,
      examScore,
      accuracyPercentage,
      correctCount: quizCorrectCount,
      incorrectCount: quizIncorrectCount,
      totalSoal,
      completedAt: new Date().toISOString(),
      answers: answerHistory,
    });
    setIsPrintResultMode(true);
  };

  const triggerBrowserPrint = () => {
    window.print();
  };

  const quitQuiz = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSelectedMaterial(null);
    setQuizQuestions([]);
    setQuizFinished(false);
    setQuizEndedByCheat(false);
  };

  const toggleFlashcardFlip = (idx) => {
    setFlippedCards((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const leaderboardData = useMemo(() => {
    return [...allScores].sort((a, b) => b.score - a.score);
  }, [allScores]);

  // ==================== (A) SPECIAL PRINT SCREEN OVERLAY (BLANK EXAM) ====================
  if (isPrintMode) {
    return (
      <div className="min-h-screen bg-white text-black p-8 font-serif select-text">
        <style>{`
          @media print {
            body { background: white !important; color: black !important; font-size: 12pt !important; }
            .no-print { display: none !important; }
            .print-area { display: block !important; }
            .page-break { page-break-after: always; }
          }
          .custom-border-kop {
            border-bottom: 5px double #000000;
          }
        `}</style>

        <div className="no-print bg-[#FF007F] neo-border p-4 mb-8 flex justify-between items-center neo-shadow">
          <div>
            <h3 className="font-sans font-black text-white text-sm">
              PRINTER ENGINE AKTIF (Kertas Ujian Fisik)
            </h3>
            <p className="font-sans text-xs text-yellow-100 font-semibold mt-0.5">
              Saran: Centang "Background graphics" dan atur "Margins:
              Default/None" di opsi print browser.
            </p>
          </div>
          <div className="flex gap-2 font-sans">
            <button
              onClick={triggerBrowserPrint}
              className="bg-[#A3E635] text-black border-2 border-black px-4 py-2 text-xs font-black hover:bg-lime-500 flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" /> CETAK / SIMPAN PDF
            </button>
            <button
              onClick={() => setIsPrintMode(false)}
              className="bg-white text-black border-2 border-black px-4 py-2 text-xs font-black hover:bg-zinc-100"
            >
              KEMBALI KE LOBBY
            </button>
          </div>
        </div>

        <div className="print-area max-w-4xl mx-auto">
          <div className="text-center pb-3 mb-6 custom-border-kop">
            <h1 className="text-xl font-bold uppercase tracking-wide">
              SOAL KUIS
            </h1>
            <h2 className="text-lg font-bold uppercase mt-0.5">
              {printMaterialName}
            </h2>
          </div>

          <div className="grid grid-cols-2 border-2 border-black p-4 mb-8 text-xs font-bold leading-relaxed">
            <div className="space-y-1">
              <p>MATA PELAJARAN : {printMaterialName}</p>
              <p>KELAS / JURUSAN : ..................................</p>
            </div>
            <div className="space-y-1 pl-4 border-l-2 border-black">
              <p>NAMA SISWA : ..................................</p>
              <p>NOMOR UJIAN : ..................................</p>
            </div>
          </div>

          <div className="text-center font-bold underline uppercase text-sm mb-6">
            LEMBAR SOAL PILIHAN GANDA (MCQ)
          </div>

          {printQuestions.length === 0 ? (
            <div className="text-center py-12 text-zinc-400 font-sans font-bold">
              Kumpulan soal kosong. Silakan generate soal materi terlebih
              dahulu.
            </div>
          ) : (
            <div className="space-y-6 text-sm">
              {printQuestions.map((q, idx) => (
                <div key={q._id || q.id} className="keep-together">
                  <p className="font-bold mb-2">
                    {idx + 1}. {q.questionText}
                  </p>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 pl-5">
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-start gap-1">
                        <span className="font-bold">
                          {String.fromCharCode(65 + oIdx)}.
                        </span>
                        <span>{opt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {userRole === "guru" && (
            <div className="page-break print-break-before mt-12 pt-8 border-t-2 border-dashed border-black">
              <div className="text-center font-bold underline uppercase text-sm mb-6">
                LEMBAR KUNCI JAWABAN (KHUSUS GURU)
              </div>
              <p className="text-xs italic mb-4 font-sans text-zinc-500 no-print">
                *Halaman ini akan otomatis terpotong di kertas terpisah saat
                dicetak fisik.
              </p>

              <div className="grid grid-cols-5 gap-4 font-bold text-sm">
                {printQuestions.map((q, idx) => (
                  <div
                    key={idx}
                    className="border border-black p-2 text-center"
                  >
                    Soal {idx + 1} :{" "}
                    <span className="bg-yellow-100 px-1">
                      {String.fromCharCode(65 + q.correctAnswerIndex)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==================== (B) HASIL EXAM OVERLAY (REVIEW SOAL & SKOR) ====================
  if (isPrintResultMode && printResultData) {
    const isPassed = printResultData.accuracyPercentage >= 70;
    const examDate = new Date(printResultData.completedAt);
    const dateFormatted = examDate.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const timeFormatted = examDate.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    return (
      <div className="hasil-exam-overlay fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 font-sans">
        <style>{`
          @media print {
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            body { background: white !important; }
            .no-print { display: none !important; }

            /* Lepaskan overlay dari posisi fixed/terpotong layar */
            .hasil-exam-overlay {
              position: static !important;
              background: white !important;
              padding: 0 !important;
              display: block !important;
            }

            /* Hilangkan batas tinggi & scroll supaya semua konten ikut tercetak */
            .hasil-exam-modal {
              box-shadow: none !important;
              max-height: none !important;
              max-width: none !important;
              width: 100% !important;
              border-radius: 0 !important;
              display: block !important;
              overflow: visible !important;
            }
            .hasil-exam-body {
              display: block !important;
              overflow: visible !important;
            }
            .hasil-exam-sidebar {
              max-width: none !important;
              width: 100% !important;
              border-right: none !important;
              border-bottom: 2px solid #e4e4e7;
              margin-bottom: 16px;
              page-break-after: avoid;
            }
            .hasil-exam-questions {
              overflow: visible !important;
            }
            /* Cegah satu soal terpotong jadi dua halaman */
            .hasil-exam-question-block {
              page-break-inside: avoid;
              break-inside: avoid;
            }
          }
        `}</style>

        <div className="hasil-exam-modal bg-white w-full max-w-5xl max-h-[90vh] rounded-lg shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 shrink-0">
            <h2 className="text-lg font-bold text-zinc-800">Hasil Exam</h2>
            <div className="flex items-center gap-4">
              <button
                onClick={triggerBrowserPrint}
                className="no-print text-xs font-bold text-zinc-500 hover:text-zinc-800 flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" /> Cetak
              </button>
              <button
                onClick={() => setIsPrintResultMode(false)}
                className="no-print text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="hasil-exam-body flex flex-1 overflow-hidden">
            {/* Sidebar ringkasan */}
            <div className="hasil-exam-sidebar w-full max-w-[220px] shrink-0 border-r border-zinc-200 p-6">
              <p className="text-xs text-zinc-500 font-semibold mb-8">
                Tanggal Ujian : {dateFormatted} pukul {timeFormatted}
              </p>

              <div className="flex justify-between gap-4 mb-8">
                <div>
                  <p className="text-sm text-zinc-500 mb-1">Total soal</p>
                  <p className="text-4xl font-light text-zinc-800">
                    {printResultData.totalSoal}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-emerald-600 mb-1">Score</p>
                  <p className="text-4xl font-light text-emerald-500">
                    {printResultData.examScore}
                    <span className="text-base text-zinc-400">
                      /{printResultData.totalSoal}
                    </span>
                  </p>
                </div>
              </div>

              <p className="text-sm text-zinc-700 leading-relaxed">
                {isPassed
                  ? "Selamat! Anda telah lulus dari ujian ini."
                  : "Mohon maaf, Anda belum lulus dari ujian ini. Silakan coba lagi."}
              </p>
            </div>

            {/* Daftar review soal */}
            <div className="hasil-exam-questions flex-1 overflow-y-auto p-6 space-y-8">
              {printResultData.answers.map((q, idx) => (
                <div key={idx} className="hasil-exam-question-block">
                  <p className="font-bold text-zinc-800 mb-3">
                    Kategori : {q.category}
                  </p>

                  <div className="flex items-start justify-between gap-4 mb-4">
                    <p className="text-zinc-800">{q.questionText}</p>
                    <span
                      className={`shrink-0 w-9 h-9 flex items-center justify-center rounded border-2 text-sm font-bold ${
                        q.isCorrect
                          ? "border-emerald-400 text-emerald-500"
                          : "border-zinc-300 text-zinc-400"
                      }`}
                    >
                      {q.isCorrect ? 1 : 0}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {q.options.map((opt, oIdx) => {
                      const letter = String.fromCharCode(65 + oIdx);
                      const isSelected = oIdx === q.selectedAnswerIndex;
                      const isCorrectOpt = oIdx === q.correctAnswerIndex;

                      let badgeStyle = "border-zinc-300 text-zinc-700";
                      let textStyle = "text-zinc-700";
                      if (isCorrectOpt) {
                        badgeStyle = "border-emerald-400 text-emerald-600";
                        textStyle = "text-zinc-800";
                      }
                      if (isSelected && !isCorrectOpt) {
                        badgeStyle = "border-red-400 text-red-500";
                        textStyle = "text-zinc-800";
                      }

                      return (
                        <div key={oIdx} className="flex items-center gap-3">
                          <span
                            className={`w-7 h-7 shrink-0 flex items-center justify-center rounded border-2 text-xs font-bold ${badgeStyle}`}
                          >
                            {letter}
                          </span>
                          <span className={`text-sm ${textStyle}`}>{opt}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {printResultData.answers.length === 0 && (
                <div className="text-sm text-zinc-400 text-center py-12">
                  Tidak ada data jawaban yang tercatat untuk ujian ini.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== (C) UNREGISTERED VIEW (LOGIN PANEL) ====================
  if (!token) {
    return (
      <div className="min-h-screen bg-[#FAF6E9] flex items-center justify-center p-4 selection:bg-[#FFFBEB]">
        <style>{`
          .neo-border { border: 4px solid #000000; }
          .neo-shadow { box-shadow: 4px 4px 0px 0px rgba(0,0,0,1); }
          .neo-shadow-lg { box-shadow: 8px 8px 0px 0px rgba(0,0,0,1); }
          .neo-shadow-sm { box-shadow: 2px 2px 0px 0px rgba(0,0,0,1); }
        `}</style>

        <div className="bg-white neo-border p-8 neo-shadow-lg max-w-md w-full">
          <div className="text-center mb-6">
            <div className="bg-[#FF007F] p-3 neo-border neo-shadow-sm rotate-[-2deg] inline-block mb-4">
              <Lock className="w-8 h-8 text-white mx-auto stroke-[2.5]" />
            </div>
            <h1 className="text-2xl font-black uppercase text-black">
              {isRegisterMode ? "Daftar Akun Baru" : "Sistem Masuk Quiz"}
            </h1>
            <p className="text-xs font-bold text-zinc-500 mt-1">
              {isRegisterMode
                ? "Buat akun Anda secara aman di database MongoDB"
                : "Silakan masuk untuk mencatatkan skor Anda ke dalam papan leaderboard."}
            </p>
          </div>

          <div className="mb-4">
            {isServerOnline ? (
              <div className="bg-green-400 text-black border-2 border-black p-2 text-center text-xs font-black flex items-center justify-center gap-1.5 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                <Wifi className="w-4 h-4" />
                SERVER BACKEND TERBACA ONLINE ✓
              </div>
            ) : (
              <div className="bg-red-400 text-white border-2 border-black p-2 text-center text-xs font-black flex flex-col gap-1 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                <div className="flex items-center justify-center gap-1.5">
                  <WifiOff className="w-4 h-4" />
                  SERVER BACKEND TERDETEKSI OFFLINE!
                </div>
                <p className="text-[10px] text-red-100 font-bold leading-normal">
                  Pastikan Node.js Anda sudah dijalankan dengan perintah "npm
                  run dev" di terminal lokal Anda.
                </p>
              </div>
            )}
          </div>

          {authError && (
            <div className="bg-red-100 border-2 border-black p-3 mb-4 text-xs font-bold text-red-700">
              ✗ {authError}
            </div>
          )}

          {authSuccess && (
            <div className="bg-green-100 border-2 border-black p-3 mb-4 text-xs font-bold text-green-800">
              {authSuccess}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-black uppercase text-black mb-1">
                Username
              </label>
              <input
                type="text"
                required
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                placeholder="Masukkan username..."
                className="w-full p-2.5 font-bold border-2 border-black focus:outline-none focus:bg-[#FFFBEB] text-black"
                maxLength={15}
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-black mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full p-2.5 font-bold border-2 border-black focus:outline-none focus:bg-[#FFFBEB] text-black"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-[#A3E635] text-black font-black text-xs border-2 border-black py-3 neo-shadow-sm hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all flex items-center justify-center gap-2 uppercase"
            >
              {authLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-black" />
              ) : isRegisterMode ? (
                <UserPlus className="w-4 h-4" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              {isRegisterMode ? "DAFTAR SEKARANG" : "MASUK KE GAME"}
            </button>
          </form>

          <div className="text-center mt-6 pt-4 border-t-2 border-dashed border-black flex flex-col gap-2">
            <button
              onClick={() => {
                setIsRegisterMode(!isRegisterMode);
                setAuthError("");
                setAuthSuccess("");
              }}
              className="text-xs font-black text-black underline hover:text-[#FF007F]"
            >
              {isRegisterMode
                ? "Sudah punya akun? Masuk di sini"
                : "Belum punya akun? Daftar gratis di sini"}
            </button>
            <button
              onClick={() => {
                const currentUrl = prompt(
                  "Ubah Alamat Gateway API Anda:",
                  apiBaseUrl,
                );
                if (currentUrl) {
                  saveCustomApiUrl(currentUrl);
                  pingServer();
                }
              }}
              className="text-[10px] text-zinc-500 font-bold hover:underline"
            >
              Pengaturan Alamat IP Backend
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== (D) REGISTERED VIEW (MAIN APP DASHBOARD) ====================
  return (
    <div className="min-h-screen bg-[#FFFBEB] text-black font-sans pb-16 neo-grid selection:bg-purple-300">
      {/* --- FLOATING TOAST SYSTEM --- */}
      {toast.show && (
        <div
          className={`fixed bottom-4 right-4 z-[99] neo-border p-4 neo-shadow-sm font-black text-xs flex items-center gap-2 animate-bounce ${
            toast.type === "error"
              ? "bg-red-400 text-black"
              : toast.type === "success"
                ? "bg-[#A3E635] text-black"
                : "bg-yellow-300 text-black"
          }`}
        >
          <Info className="w-4 h-4 shrink-0" />
          <span>{toast.message}</span>
          <button
            onClick={() => setToast({ ...toast, show: false })}
            className="ml-2 bg-white border border-black p-0.5 hover:bg-zinc-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* --- TOP HEADER --- */}
      <header className="bg-[#FF007F] neo-border sticky top-0 z-50 p-4 m-4 md:mx-8 md:my-6 rounded-none neo-shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-yellow-300 p-2 neo-border neo-shadow-sm rotate-[-2deg]">
            <Sparkles className="w-8 h-8 text-black stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              Quiz With AI
            </h1>
            <p className="text-xs font-bold text-yellow-100">
              Sesi Kuis Kelas Multiplayer Real-time
            </p>
          </div>
        </div>

        {/* Level Progress Indicator */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-black text-[#A3E635] neo-border px-3 py-1.5 flex items-center gap-2 text-xs font-black shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            <Zap className="w-4 h-4 text-yellow-300 fill-yellow-300 animate-pulse" />
            <span>LVL {userLevel}</span>
            <div className="w-16 bg-zinc-800 h-2 border border-[#A3E635] overflow-hidden">
              <div
                className="bg-[#A3E635] h-full"
                style={{ width: `${xpProgress}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-300">{userXP} XP</span>
          </div>

          <div className="flex items-center gap-2 bg-yellow-300 text-black neo-border px-3 py-1.5 neo-shadow-sm text-xs md:text-sm font-bold">
            <User className="w-4 h-4 text-black" />
            <span>
              Halo,{" "}
              <strong className="font-black text-purple-800">
                {username || "NeoPlayer"}
              </strong>
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="bg-white hover:bg-zinc-50 text-black border-2 border-black px-3 py-1.5 text-xs font-black flex items-center gap-1.5 shadow-[2px_2px_0px_rgba(0,0,0,1)]"
          >
            <LogOut className="w-4 h-4 text-red-600" />
            LOGOUT
          </button>
        </div>
      </header>

      {/* --- MAIN TAB NAVIGATION --- */}
      <div className="max-w-6xl mx-auto px-4 md:px-8 mt-2">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          <button
            onClick={() => {
              quitQuiz();
              resetMultiplayerState();
              setCurrentTab("quiz");
            }}
            className={`p-3 text-xs md:text-sm font-black neo-border neo-shadow-sm flex items-center justify-center gap-2 transition-all ${currentTab === "quiz" ? "bg-[#A3E635] text-black -translate-y-1" : "bg-white hover:bg-zinc-100"}`}
          >
            <BookOpen className="w-5 h-5" />
            SOLO KUIS
          </button>

          <button
            onClick={() => {
              quitQuiz();
              resetMultiplayerState();
              setCurrentTab("multiplayer");
            }}
            className={`p-3 text-xs md:text-sm font-black neo-border neo-shadow-sm flex items-center justify-center gap-2 transition-all ${currentTab === "multiplayer" ? "bg-[#FF007F] text-white -translate-y-1" : "bg-white hover:bg-zinc-100"}`}
          >
            <Users className="w-5 h-5" />
            MABAR KELAS
          </button>

          <button
            onClick={() => {
              quitQuiz();
              resetMultiplayerState();
              setCurrentTab("generator");
            }}
            className={`p-3 text-xs md:text-sm font-black neo-border neo-shadow-sm flex items-center justify-center gap-2 transition-all ${currentTab === "generator" ? "bg-[#22D3EE] text-black -translate-y-1" : "bg-white hover:bg-zinc-100"}`}
          >
            <Sparkles className="w-5 h-5" />
            AI GENERATOR
          </button>

          <button
            onClick={() => {
              quitQuiz();
              resetMultiplayerState();
              setCurrentTab("leaderboard");
            }}
            className={`p-3 text-xs md:text-sm font-black neo-border neo-shadow-sm flex items-center justify-center gap-2 transition-all ${currentTab === "leaderboard" ? "bg-purple-400 text-black -translate-y-1" : "bg-white hover:bg-zinc-100"}`}
          >
            <Award className="w-5 h-5" />
            LEADERBOARD
          </button>

          <button
            onClick={() => {
              quitQuiz();
              resetMultiplayerState();
              setCurrentTab("export");
            }}
            className={`p-3 text-xs md:text-sm font-black neo-border neo-shadow-sm flex items-center justify-center gap-2 transition-all ${currentTab === "export" ? "bg-[#F97316] text-white -translate-y-1" : "bg-white hover:bg-zinc-100"}`}
          >
            <Layers className="w-5 h-5" />
            SETTING API
          </button>
        </div>

        {/* --- ERROR BANNER --- */}
        {errorStatus && (
          <div className="bg-red-100 border-4 border-black p-4 mb-6 neo-shadow-sm flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
            <div>
              <h4 className="font-black text-sm text-red-800">
                GAGAL TERKONEKSI KE SERVER!
              </h4>
              <p className="text-xs font-bold text-red-600 mt-1">
                {errorStatus}
              </p>
              <button
                onClick={() => {
                  fetchMaterials();
                  fetchScores();
                }}
                className="mt-3 bg-white hover:bg-zinc-50 border-2 border-black px-3 py-1 text-xs font-black"
              >
                Coba Hubungkan Ulang
              </button>
            </div>
          </div>
        )}

        {/* --- LOADING SPINNER --- */}
        {loadingData && (
          <div className="bg-yellow-100 border-4 border-black p-4 mb-6 flex items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-black" />
            <span className="font-bold text-sm">
              Menghubungkan ke Database MongoDB...
            </span>
          </div>
        )}

        {/* ==================== TAB 1: SOLO PLAY ==================== */}
        {currentTab === "quiz" && !loadingData && (
          <div>
            {!selectedMaterial ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2 bg-white neo-border p-6 neo-shadow-lg">
                  <div className="flex items-center gap-2 mb-4 bg-yellow-300 p-2 border-2 border-black self-start w-fit rotate-[-1deg]">
                    <h2 className="text-xl font-black text-black">
                      Materi Belajar Tersedia
                    </h2>
                  </div>
                  <p className="font-semibold text-zinc-700 text-sm mb-6">
                    Pilih materi untuk memulai kuis atau klik "Cetak Ujian"
                    untuk ekspor berkas fisik.
                  </p>

                  {materials.length === 0 ? (
                    <div className="bg-yellow-100 border-2 border-dashed border-black p-8 text-center">
                      <p className="font-black text-lg text-black">
                        Materi Belum Tersedia!
                      </p>
                      <p className="text-sm font-semibold text-zinc-600 mt-1">
                        Gunakan tab AI GENERATOR untuk membuat materi baru.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {materials.map((mat) => (
                        <div
                          key={mat._id}
                          className="bg-amber-50 neo-border p-4 flex flex-col justify-between neo-shadow-sm hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              {/* BADGE TOTAL SOAL REAL-TIME DARI DATABASE MONGO */}
                              <span className="bg-purple-300 text-black border border-black px-2 py-0.5 text-[10px] font-black uppercase">
                                {mat.questionCount ?? 0} SOAL READY
                              </span>
                            </div>
                            <h3 className="text-lg font-black leading-tight text-black mb-4">
                              {mat.name}
                            </h3>
                          </div>
                          <div className="space-y-2 mt-auto">
                            <button
                              onClick={() => startQuiz(mat)}
                              className="w-full bg-[#A3E635] text-black border-2 border-black py-2 text-xs font-black flex items-center justify-center gap-1 hover:bg-lime-500"
                            >
                              MULAI BELAJAR INDIVIDU{" "}
                              <ChevronRight className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handlePrintExamLoad(mat)}
                              disabled={loadingPrint}
                              className="w-full bg-white hover:bg-zinc-100 text-black border-2 border-black py-1.5 text-[10px] font-black flex items-center justify-center gap-1.5"
                            >
                              {loadingPrint ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <FileText className="w-3.5 h-3.5" />
                              )}
                              CETAK KERTAS UJIAN (PDF)
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-[#C084FC] neo-border p-6 neo-shadow-lg text-black">
                  <div className="bg-white border-2 border-black p-2 rotate-[2deg] mb-4 inline-block">
                    <h3 className="font-black text-lg">⚠️ ATURAN MAIN</h3>
                  </div>
                  <div className="space-y-4 font-bold text-sm mt-4">
                    <div className="bg-white border-2 border-black p-3 neo-shadow-sm">
                      <p className="text-xs text-zinc-500">POIN SKOR</p>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-green-600 font-black text-sm">
                          BENAR: +10
                        </span>
                        <span className="text-red-500 font-black text-sm">
                          SALAH: -5
                        </span>
                      </div>
                    </div>
                    <div className="bg-white border-2 border-black p-3 neo-shadow-sm">
                      <p className="text-xs text-zinc-500">TIMER SOAL</p>
                      <p className="text-base font-black">20 Detik / Soal</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto">
                {!quizFinished ? (
                  <div className="bg-white neo-border p-6 md:p-8 neo-shadow-lg">
                    <div className="flex items-center justify-between border-b-4 border-black pb-4 mb-6">
                      <div>
                        <span className="bg-purple-300 text-black border-2 border-black px-2 py-0.5 text-xs font-black">
                          {selectedMaterial.name}
                        </span>
                        <h2 className="text-lg font-bold mt-1 text-zinc-600">
                          Pertanyaan {currentQuestionIdx + 1} dari 10
                        </h2>
                      </div>
                      <button
                        onClick={quitQuiz}
                        className="bg-red-400 hover:bg-red-500 text-black border-2 border-black px-3 py-1 font-black text-xs"
                      >
                        MENYERAH
                      </button>
                    </div>

                    <div className="mb-6">
                      <div className="flex justify-between items-center mb-1 text-xs font-black">
                        <span>SISA WAKTU:</span>
                        <span
                          className={`text-base ${timeLeft <= 5 ? "text-red-600 animate-bounce" : "text-black"}`}
                        >
                          {timeLeft} Detik
                        </span>
                      </div>
                      <div className="w-full bg-zinc-200 border-2 border-black h-4 overflow-hidden">
                        <div
                          className="bg-red-50 h-full transition-all duration-1000 border-r-2 border-black"
                          style={{ width: `${(timeLeft / 20) * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="bg-yellow-100 border-2 border-black p-3 mb-6 flex justify-between items-center text-xs font-bold">
                      <span>
                        SKOR AKTIF:{" "}
                        <strong className="text-lg font-black ml-1">
                          {quizScore}
                        </strong>
                      </span>
                      <div className="flex gap-3">
                        <span className="text-green-700">
                          Benar: {quizCorrectCount}
                        </span>
                        <span className="text-red-700">
                          Salah: {quizIncorrectCount}
                        </span>
                      </div>
                    </div>

                    <div
                      className="bg-zinc-50 border-2 border-black p-5 md:p-6 mb-6 select-none"
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <p className="text-lg font-black leading-relaxed text-black">
                        {quizQuestions[currentQuestionIdx]?.questionText}
                      </p>
                    </div>

                    <div
                      className="grid grid-cols-1 gap-4 mb-8 select-none"
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      {quizQuestions[currentQuestionIdx]?.options.map(
                        (option, idx) => {
                          const letter = String.fromCharCode(65 + idx);
                          const isCorrectAnswer =
                            idx ===
                            quizQuestions[currentQuestionIdx]
                              .correctAnswerIndex;
                          const isSelected = selectedAnswer === idx;

                          let btnStyle =
                            "bg-white hover:bg-zinc-100 text-black";
                          let iconElement = null;

                          if (hasAnswered) {
                            if (isCorrectAnswer) {
                              btnStyle =
                                "bg-green-400 text-black border-green-700";
                              iconElement = (
                                <Check className="w-5 h-5 text-black stroke-[3]" />
                              );
                            } else if (isSelected) {
                              btnStyle = "bg-red-400 text-black border-red-700";
                              iconElement = (
                                <X className="w-5 h-5 text-black stroke-[3]" />
                              );
                            } else {
                              btnStyle =
                                "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed opacity-60";
                            }
                          }

                          return (
                            <button
                              key={idx}
                              disabled={hasAnswered}
                              onClick={() => handleAnswerClick(idx)}
                              className={`neo-border p-4 text-left font-bold text-sm flex items-center justify-between transition-all ${btnStyle} ${!hasAnswered ? "neo-shadow-sm hover:translate-x-0.5 hover:translate-y-0.5" : ""}`}
                            >
                              <span className="flex items-center gap-3">
                                <span className="bg-black text-white w-6 h-6 flex items-center justify-center text-xs font-black shrink-0">
                                  {letter}
                                </span>
                                <span>{option}</span>
                              </span>
                              {iconElement}
                            </button>
                          );
                        },
                      )}
                    </div>

                    {hasAnswered && (
                      <div className="bg-yellow-300 border-2 border-black p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="font-bold text-sm">
                          {selectedAnswer === -1 ? (
                            <span className="text-red-700 font-black">
                              Waktu Habis! Tidak mendapat poin.
                            </span>
                          ) : selectedAnswer ===
                            quizQuestions[currentQuestionIdx]
                              .correctAnswerIndex ? (
                            <span className="text-green-700 font-black">
                              Hebat! Jawaban Anda Benar (+10 poin).
                            </span>
                          ) : (
                            <span className="text-red-700 font-black">
                              Salah! Tidak mendapat poin.
                            </span>
                          )}
                        </div>
                        <button
                          onClick={handleNextQuestion}
                          className="w-full sm:w-auto bg-black text-white px-6 py-2 font-black text-sm border-2 border-black hover:bg-zinc-800"
                        >
                          {currentQuestionIdx < 9
                            ? "SOAL SELANJUTNYA"
                            : "LIHAT HASIL KUIS"}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white neo-border p-8 neo-shadow-lg text-center">
                    {quizEndedByCheat && (
                      <div className="bg-red-500 border-4 border-black p-3 mb-6 text-white font-black text-sm">
                        ⚠️ KUIS DIHENTIKAN OTOMATIS! Kamu terdeteksi berpindah
                        tab/aplikasi saat kuis berlangsung.
                      </div>
                    )}
                    <div className="bg-[#A3E635] border-4 border-black p-4 inline-block rotate-[-2deg] mb-6">
                      <Award className="w-16 h-16 text-black stroke-[2] mx-auto mb-2" />
                      <h2 className="text-2xl font-black text-black">
                        KUIS SELESAI!
                      </h2>
                    </div>
                    <p className="font-bold text-lg text-zinc-700 mt-2">
                      Hasil Kuis Anda untuk materi: <br />
                      <span className="text-xl font-black text-black underline bg-yellow-100 px-2 py-0.5 inline-block mt-1">
                        {selectedMaterial.name}
                      </span>
                    </p>

                    <div className="grid grid-cols-3 gap-4 max-w-md mx-auto my-8">
                      <div className="bg-yellow-100 border-2 border-black p-3">
                        <p className="text-xs text-zinc-500 font-bold">
                          SKOR AKHIR
                        </p>
                        <p className="text-2xl font-black text-black">
                          {quizScore}
                        </p>
                      </div>
                      <div className="bg-green-100 border-2 border-black p-3">
                        <p className="text-xs text-zinc-500 font-bold">BENAR</p>
                        <p className="text-2xl font-black text-green-700">
                          {quizCorrectCount}
                        </p>
                      </div>
                      <div className="bg-red-100 border-2 border-black p-3">
                        <p className="text-xs text-zinc-500 font-bold">SALAH</p>
                        <p className="text-2xl font-black text-red-600">
                          {quizIncorrectCount}
                        </p>
                      </div>
                    </div>

                    {/* ==================== AI WEAKNESS FLASHCARDS PANEL ==================== */}
                    <div className="mt-8 border-t-4 border-dashed border-black pt-8">
                      <div className="bg-purple-300 border-2 border-black p-2.5 inline-block rotate-[1deg] mb-4">
                        <h3 className="font-black text-sm flex items-center justify-center gap-1.5 text-black">
                          <Sparkles className="w-4 h-4 fill-black" /> ANALISIS
                          KELEMAHAN AI (ACTIVE RECALL)
                        </h3>
                      </div>

                      {quizIncorrectCount === 0 ? (
                        <div className="bg-green-100 border-2 border-black p-4 text-xs font-bold text-green-800">
                          🎉 NILAI SEMPURNA! AI mendeteksi Anda tidak memiliki
                          kesalahan pada materi kuis ini. Pertahankan
                          prestasimu!
                        </div>
                      ) : loadingFlashcards ? (
                        <div className="bg-yellow-50 border-2 border-dashed border-black p-8 flex flex-col items-center justify-center gap-2">
                          <Loader2 className="w-8 h-8 animate-spin text-black" />
                          <p className="text-xs font-black uppercase text-zinc-600">
                            Kecerdasan AI sedang memetakan kelemahan Anda &
                            memproduksi 3 Kartu Belajar khusus...
                          </p>
                        </div>
                      ) : flashcards.length > 0 ? (
                        <div className="space-y-4 text-left">
                          <p className="text-xs font-bold text-zinc-500 text-center mb-4">
                            Klik pada kartu di bawah ini untuk membalikkan
                            posisi dan melihat kunci teorinya.
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {flashcards.map((card, idx) => {
                              const isFlipped = !!flippedCards[idx];
                              return (
                                <div
                                  key={idx}
                                  onClick={() => toggleFlashcardFlip(idx)}
                                  className="cursor-pointer select-none"
                                >
                                  {/* Container Kartu Neobrutalism Flippable */}
                                  <div
                                    className={`min-h-[180px] p-4 border-4 border-black transition-all duration-300 flex flex-col justify-between ${
                                      isFlipped
                                        ? "bg-yellow-200 text-black rotate-[-1deg]"
                                        : "bg-white text-black hover:-translate-y-1 hover:-translate-x-1 hover:shadow-lg shadow-[4px_4px_0px_rgba(0,0,0,1)]"
                                    }`}
                                  >
                                    <div>
                                      <span className="text-[10px] bg-black text-white font-black px-2 py-0.5 border border-black uppercase mb-3 inline-block">
                                        {isFlipped
                                          ? "KUNCI PENJELASAN"
                                          : `TANTANGAN KARTU ${idx + 1}`}
                                      </span>
                                      <p className="text-xs md:text-sm font-black leading-relaxed">
                                        {isFlipped ? card.back : card.front}
                                      </p>
                                    </div>
                                    <div className="text-right text-[9px] font-black underline uppercase text-zinc-500 mt-4">
                                      {isFlipped
                                        ? "LIHAT SOAL KEMBALI"
                                        : "BALIK KARTU"}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-red-50 border-2 border-black p-4 text-xs font-bold text-red-700">
                          Gagal memuat analisis kelemahan AI otomatis.
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8 pt-6 border-t-2 border-black">
                      <button
                        onClick={handlePrintResultLoad}
                        className="w-full sm:w-auto bg-[#F97316] text-white border-2 border-black px-6 py-3 font-black text-sm neo-shadow-sm hover:translate-x-0.5 hover:translate-y-0.5 flex items-center justify-center gap-1.5"
                      >
                        <Download className="w-4 h-4" /> LIHAT HASIL EXAM
                      </button>
                      <button
                        onClick={() => startQuiz(selectedMaterial)}
                        className="w-full sm:w-auto bg-[#22D3EE] text-black border-2 border-black px-6 py-3 font-black text-sm neo-shadow-sm hover:translate-x-0.5 hover:translate-y-0.5"
                      >
                        RETRY / ULANG LAGI
                      </button>
                      <button
                        onClick={quitQuiz}
                        className="w-full sm:w-auto bg-black text-white border-2 border-black px-6 py-3 font-black text-sm neo-shadow-sm hover:translate-x-0.5 hover:translate-y-0.5"
                      >
                        KEMBALI KE LOBBY
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 2: CLASSROOM MULTIPLAYER 🔥 ==================== */}
        {currentTab === "multiplayer" && (
          <div className="max-w-4xl mx-auto">
            {mpError && (
              <div className="bg-red-100 border-4 border-black p-4 mb-6 neo-shadow-sm text-sm font-black text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>✗ {mpError}</span>
              </div>
            )}

            {!mpRoomId ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Bagian Gabung Kelas (Siswa) */}
                <div className="bg-white neo-border p-6 neo-shadow-lg flex flex-col justify-between">
                  <div>
                    <div className="bg-[#FF007F] text-white p-2.5 border-2 border-black self-start w-fit rotate-[-1.5deg] mb-4">
                      <h3 className="font-black text-base flex items-center gap-1.5">
                        <Key className="w-5 h-5" /> GABUNG KELAS (SISWA)
                      </h3>
                    </div>
                    <p className="text-xs font-bold text-zinc-600 mb-6 leading-relaxed">
                      Masukkan PIN Ruangan 6-digit yang dibagikan oleh Host Anda
                      untuk bersaing secara real-time.
                    </p>
                    <form onSubmit={handleJoinRoom} className="space-y-4">
                      <div>
                        <label className="block text-xs font-black uppercase text-black mb-1">
                          PIN RUANGAN KUIS
                        </label>
                        <input
                          type="text"
                          value={mpRoomIdInput}
                          onChange={(e) => setMpRoomIdInput(e.target.value)}
                          placeholder="Contoh PIN: 421098"
                          className="w-full p-3 font-black tracking-widest text-center text-lg border-4 border-black focus:outline-none focus:bg-[#FFFBEB]"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full bg-yellow-300 hover:bg-yellow-400 text-black font-black py-3.5 border-4 border-black neo-shadow-sm hover:translate-y-0.5 transition-all"
                      >
                        GABUNG SEKARANG
                      </button>
                    </form>
                  </div>
                </div>

                {/* Bagian Bikin Kelas Baru (Guru/Host) */}
                <div className="bg-[#C084FC] neo-border p-6 neo-shadow-lg text-black">
                  <div className="bg-white text-black p-2.5 border-2 border-black self-start w-fit rotate-[1.5deg] mb-4">
                    <h3 className="font-black text-base flex items-center gap-1.5">
                      <Crown className="w-5 h-5 text-yellow-500" /> BUAT RUANG
                      GURU (HOST)
                    </h3>
                  </div>
                  <p className="text-xs font-bold text-zinc-950 mb-6 leading-relaxed">
                    Pilih salah satu materi yang sudah Anda buat di bawah ini
                    untuk memulai kuis bersama.
                  </p>

                  {materials.length === 0 ? (
                    <div className="bg-white border-2 border-dashed border-black p-6 text-center text-xs font-bold">
                      Belum ada materi kuis untuk dirancang kelas.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                      {materials.map((mat) => (
                        <div
                          key={mat._id}
                          className="bg-white border-2 border-black p-3 flex justify-between items-center hover:bg-zinc-50"
                        >
                          <span className="font-black text-xs truncate max-w-[180px]">
                            {mat.name}
                          </span>
                          <button
                            onClick={() => handleCreateRoom(mat._id)}
                            className="bg-[#A3E635] hover:bg-lime-500 border-2 border-black px-3 py-1.5 text-[10px] font-black"
                          >
                            BUAT PIN LIVE
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div>
                {!mpQuizStarted ? (
                  /* ====== (1) SCREEN LOBBY RUANG TUNGGU ====== */
                  <div className="bg-white neo-border p-6 md:p-8 neo-shadow-lg text-center">
                    <div className="bg-yellow-300 border-4 border-black p-6 inline-block rotate-[-1deg] mb-6">
                      <p className="text-xs font-black text-zinc-600 uppercase tracking-widest">
                        PIN MASUK MULTIPLAYER
                      </p>
                      <h1 className="text-4xl md:text-5xl font-black text-black tracking-widest mt-1 animate-pulse">
                        {mpRoomId}
                      </h1>
                    </div>

                    <h2 className="text-xl font-black text-black">
                      {mpMaterialName}
                    </h2>
                    <p className="text-xs font-bold text-zinc-500 mt-1">
                      {mpRole === "host"
                        ? "Menunggu siswa bergabung sebelum memulai kuis..."
                        : "Menunggu guru/host memulai kuis secara serentak..."}
                    </p>

                    <div className="border-4 border-dashed border-black bg-zinc-50 p-6 my-8 rounded-none">
                      <div className="flex items-center justify-between border-b-2 border-black pb-3 mb-4 text-xs font-black text-zinc-600">
                        <span>SISWA BERGABUNG</span>
                        <span className="bg-black text-white px-2 py-0.5">
                          {mpLobbyPlayers.length} ORANG
                        </span>
                      </div>

                      {mpLobbyPlayers.length === 0 ? (
                        <div className="py-8 text-center text-sm font-bold text-zinc-400 animate-pulse">
                          Hubungi siswa untuk memasukkan PIN {mpRoomId}...
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {mpLobbyPlayers.map((player, idx) => (
                            <div
                              key={idx}
                              className="bg-white border-2 border-black p-3 font-black text-xs text-center flex items-center justify-center gap-1.5 shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                            >
                              <span className="w-2.5 h-2.5 bg-green-500 rounded-full " />
                              <span className="truncate">
                                {player.username}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                      {mpRole === "host" && (
                        <button
                          disabled={mpLobbyPlayers.length === 0}
                          onClick={handleStartMpQuiz}
                          className="w-full sm:w-auto bg-[#A3E635] hover:bg-lime-500 text-black font-black border-4 border-black px-8 py-3.5 neo-shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          <Play className="w-5 h-5 fill-black" />
                          MULAI KELAS SEKARANG
                        </button>
                      )}
                      <button
                        onClick={resetMultiplayerState}
                        className="w-full sm:w-auto bg-red-400 hover:bg-red-500 text-black border-4 border-black px-6 py-3.5 font-black text-sm"
                      >
                        {mpRole === "host" ? "BATALKAN KELAS" : "KELUAR KELAS"}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ====== (2) SCREEN AKTIF KUIS BERJALAN ====== */
                  <div className="max-w-3xl mx-auto">
                    {!mpGameFinished ? (
                      <div className="bg-white neo-border p-6 md:p-8 neo-shadow-lg">
                        <div className="flex items-center justify-between border-b-4 border-black pb-4 mb-6">
                          <div>
                            <span className="bg-[#FF007F] text-white border-2 border-black px-2.5 py-1 text-xs font-black">
                              LIVE CLASS: {mpRoomId}
                            </span>
                            <h2 className="text-lg font-bold mt-1 text-zinc-600">
                              Pertanyaan {mpCurrentQuestionIndex + 1} dari 10
                            </h2>
                          </div>
                          <div className="bg-yellow-300 border-2 border-black px-3 py-1 font-black text-xs">
                            ROLE: {mpRole.toUpperCase()}
                          </div>
                        </div>

                        {mpRole === "host" && (
                          <div className="bg-purple-100 border-2 border-black p-4 mb-6">
                            <h4 className="text-xs font-black text-purple-950 mb-2">
                              STATUS RESPONDEN SISWA:
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {mpLobbyPlayers.map((p, idx) => (
                                <span
                                  key={idx}
                                  className={`px-2 py-1 text-[10px] font-black border-2 border-black ${p.isAnswered ? "bg-green-400 text-black" : "bg-zinc-200 text-zinc-400"}`}
                                >
                                  {p.username} {p.isAnswered ? "✓" : "..."}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div
                          className="bg-zinc-50 border-2 border-black p-5 md:p-6 mb-6 select-none"
                          onContextMenu={(e) => e.preventDefault()}
                        >
                          <p className="text-lg font-black leading-relaxed text-black">
                            {mpCurrentQuestion?.questionText}
                          </p>
                        </div>

                        <div
                          className="grid grid-cols-1 gap-4 mb-8 select-none"
                          onContextMenu={(e) => e.preventDefault()}
                        >
                          {mpCurrentQuestion?.options.map((option, idx) => {
                            const letter = String.fromCharCode(65 + idx);
                            const isCorrectAnswer =
                              idx === mpCorrectAnswerIndex;
                            const isSelected = mpSelectedOptionIndex === idx;

                            let btnStyle =
                              "bg-white hover:bg-zinc-100 text-black";
                            let iconElement = null;

                            if (mpShowCorrectAnswer) {
                              if (isCorrectAnswer) {
                                btnStyle =
                                  "bg-green-400 text-black border-green-700";
                                iconElement = (
                                  <Check className="w-5 h-5 text-black stroke-[3]" />
                                );
                              } else if (isSelected) {
                                btnStyle =
                                  "bg-red-400 text-black border-red-700";
                                iconElement = (
                                  <X className="w-5 h-5 text-black stroke-[3]" />
                                );
                              } else {
                                btnStyle =
                                  "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed opacity-60";
                              }
                            } else if (mpHasAnswered && isSelected) {
                              btnStyle =
                                "bg-yellow-200 text-black border-yellow-600 animate-pulse";
                            }

                            return (
                              <button
                                key={idx}
                                disabled={
                                  mpHasAnswered ||
                                  mpShowCorrectAnswer ||
                                  mpRole === "host"
                                }
                                onClick={() => handleMpAnswerSubmit(idx)}
                                className={`neo-border p-4 text-left font-bold text-sm flex items-center justify-between transition-all ${btnStyle} ${!mpHasAnswered && mpRole === "player" ? "neo-shadow-sm hover:translate-x-0.5 hover:translate-y-0.5" : ""}`}
                              >
                                <span className="flex items-center gap-3">
                                  <span className="bg-black text-white w-6 h-6 flex items-center justify-center text-xs font-black shrink-0">
                                    {letter}
                                  </span>
                                  <span>{option}</span>
                                </span>
                                {iconElement}
                              </button>
                            );
                          })}
                        </div>

                        {mpShowCorrectAnswer && (
                          <div className="bg-zinc-50 border-4 border-black p-6 mb-6">
                            <h3 className="font-black text-xs text-zinc-600 mb-4 tracking-widest uppercase">
                              PAPAN SKOR LIVE:
                            </h3>
                            <div className="space-y-2">
                              {mpRealtimeLeaderboard
                                .slice(0, 5)
                                .map((player, idx) => (
                                  <div
                                    key={idx}
                                    className="bg-white border-2 border-black p-2.5 flex items-center justify-between text-xs font-bold"
                                  >
                                    <span className="font-black">
                                      {idx + 1}. {player.username}
                                    </span>
                                    <span className="bg-yellow-300 px-2 py-0.5 border border-black font-black">
                                      {player.score} XP
                                    </span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {mpRole === "host" && mpShowCorrectAnswer && (
                          <button
                            onClick={handleNextMpQuestion}
                            className="w-full bg-[#A3E635] hover:bg-lime-500 text-black border-4 border-black py-4 font-black text-sm flex items-center justify-center gap-2"
                          >
                            LANJUT KE SOAL BERIKUTNYA{" "}
                            <ChevronRight className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="bg-white neo-border p-8 neo-shadow-lg text-center">
                        <div className="bg-yellow-300 border-4 border-black p-6 inline-block rotate-[-2deg] mb-6">
                          <Crown className="w-16 h-16 text-black stroke-[2] mx-auto mb-2" />
                          <h2 className="text-2xl font-black text-black">
                            MABAR KELAS SELESAI!
                          </h2>
                        </div>

                        <h3 className="text-lg font-black text-black mb-6">
                          PAPAN PERINGKAT AKHIR MULTIPLAYER:
                        </h3>

                        <div className="max-w-md mx-auto space-y-3 mb-8">
                          {mpFinalLeaderboard.map((player, idx) => (
                            <div
                              key={idx}
                              className={`border-4 border-black p-4 flex items-center justify-between ${idx === 0 ? "bg-yellow-300" : "bg-white"} font-black`}
                            >
                              <span className="text-sm">
                                {idx + 1}. {player.username}
                              </span>
                              <span className="text-sm bg-black text-white px-3 py-1">
                                {player.score} XP
                              </span>
                            </div>
                          ))}
                        </div>

                        <button
                          onClick={resetMultiplayerState}
                          className="w-full sm:w-auto bg-black text-white border-4 border-black px-8 py-3.5 font-black text-sm"
                        >
                          KEMBALI KE LOBI UTAMA
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 3: AI GENERATOR ==================== */}
        {currentTab === "generator" && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white neo-border p-6 md:p-8 neo-shadow-lg">
              <div className="flex items-center gap-2 mb-4 bg-[#22D3EE] p-2 border-2 border-black self-start w-fit rotate-[-1.5deg]">
                <h2 className="text-xl font-black text-black">
                  AI Generator (Soal Otomatis)
                </h2>
              </div>

              {!isGenerating && (
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <button
                    type="button"
                    onClick={() => setGeneratorMode("text")}
                    className={`p-3 text-xs md:text-sm font-black border-2 border-black ${generatorMode === "text" ? "bg-yellow-300 text-black shadow-[2px_2px_0px_rgba(0,0,0,1)]" : "bg-zinc-50 text-zinc-500"}`}
                  >
                    📝 BERDASARKAN TOPIK TEKS
                  </button>
                  <button
                    type="button"
                    onClick={() => setGeneratorMode("pdf")}
                    className={`p-3 text-xs md:text-sm font-black border-2 border-black ${generatorMode === "pdf" ? "bg-purple-300 text-black shadow-[2px_2px_0px_rgba(0,0,0,1)]" : "bg-zinc-50 text-zinc-500"}`}
                  >
                    📂 BERDASARKAN UPLOAD PDF
                  </button>
                </div>
              )}

              <p className="font-semibold text-zinc-600 text-sm mb-6">
                {generatorMode === "text"
                  ? "Masukkan topik materi pembelajaran apa pun di bawah ini. AI akan merancang soal berkualitas tinggi berdasarkan topik tersebut."
                  : "Unggah berkas dokumen pelajaran berformat PDF (maksimal 10MB). AI akan membedah isi teks dokumen Anda dan membuat soal kuis yang akurat sesuai materi tersebut."}
              </p>

              {isGenerating ? (
                <div className="bg-yellow-50 border-4 border-black p-6 mb-4 neo-shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <Loader2 className="w-8 h-8 text-black animate-spin" />
                    <div>
                      <h4 className="font-black text-lg">
                        PROSES GENERASI SEDANG BERJALAN...
                      </h4>
                      <p className="text-xs font-bold text-zinc-500">
                        Materi: {topicName}
                      </p>
                    </div>
                  </div>

                  <div className="bg-black text-green-400 p-4 font-mono text-xs rounded-none h-44 overflow-y-auto space-y-1.5 border-2 border-black">
                    {generationLogs.map((log, index) => (
                      <p key={index} className="leading-relaxed">
                        &gt; {log}
                      </p>
                    ))}
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={
                    generatorMode === "text"
                      ? handleGenerateMaterial
                      : handleGeneratePdfMaterial
                  }
                  className="space-y-6"
                >
                  <div>
                    <label className="block text-sm font-black text-black mb-2 uppercase">
                      Nama Materi Pelajaran / Judul Bab
                    </label>
                    <input
                      type="text"
                      required
                      value={topicName}
                      onChange={(e) => setTopicName(e.target.value)}
                      placeholder={
                        generatorMode === "text"
                          ? "Contoh: Algoritma & Pemrograman Dasar C++"
                          : "Contoh: Bab 4 Sejarah Majapahit"
                      }
                      className="w-full p-4 text-base font-bold text-black border-4 border-black focus:outline-none focus:bg-amber-50 rounded-none neo-shadow-sm"
                    />
                  </div>

                  {generatorMode === "pdf" && (
                    <div className="space-y-2">
                      <label className="block text-sm font-black text-black uppercase">
                        Pilih Berkas PDF Materi
                      </label>
                      <div className="relative border-4 border-dashed border-black bg-zinc-50 p-6 text-center hover:bg-zinc-100 transition-all">
                        <input
                          type="file"
                          required
                          accept="application/pdf"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              setPdfFile(e.target.files[0]);
                            }
                          }}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="space-y-1.5 pointer-events-none">
                          <Plus className="w-8 h-8 text-black mx-auto stroke-[2.5]" />
                          <p className="text-xs font-black">
                            {pdfFile
                              ? `✓ Berkas Siap: ${pdfFile.name}`
                              : "KLIK UNTUK MEMILIH FILE PDF (MAKS 10MB)"}
                          </p>
                          {pdfFile && (
                            <p className="text-[10px] font-bold text-purple-700">
                              Ukuran Berkas:{" "}
                              {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-zinc-100 border-2 border-black p-4 text-xs font-bold text-zinc-600 leading-relaxed">
                    💡 <span className="text-black">Kiat Sukses:</span>{" "}
                    {generatorMode === "text"
                      ? "Gunakan nama topik yang spesifik agar kecerdasan buatan dapat memproduksi pertanyaan dengan presisi akademis."
                      : "Pastikan berkas PDF yang Anda unggah memiliki struktur teks yang jelas (bukan hasil scan gambar buram) agar AI mudah merancang soal."}
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#A3E635] text-black font-black text-base border-4 border-black py-4 neo-shadow-sm hover:translate-x-1 hover:translate-y-1 hover:shadow-none active:translate-x-2 active:translate-y-2 transition-all flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-5 h-5 text-black stroke-[2.5]" />
                    {generatorMode === "text"
                      ? "GENERATE 100 SOAL SEKARANG"
                      : "BEDAH PDF & BUAT 100 SOAL"}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 4: LEADERBOARD & REPORTS ==================== */}
        {currentTab === "leaderboard" && (
          <div className="bg-white neo-border p-6 md:p-8 neo-shadow-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b-4 border-black pb-4 mb-6">
              <div>
                <div className="flex items-center gap-2 bg-[#FF007F] p-2 border-2 border-black self-start w-fit rotate-[-1deg] text-white">
                  <h2 className="text-xl font-black">
                    Laporan Nilai & Ranking
                  </h2>
                </div>
                <p className="text-xs font-bold text-zinc-500 mt-2">
                  Daftar pencapaian real-time seluruh user yang tersimpan di
                  MongoDB Cloud.
                </p>
              </div>

              <div className="bg-yellow-300 text-black border-2 border-black px-3 py-1 text-xs font-black">
                TOTAL PENGERJAAN: {allScores.length} KALI
              </div>
            </div>

            {leaderboardData.length === 0 ? (
              <div className="bg-yellow-50 border-2 border-dashed border-black p-12 text-center rounded-none">
                <p className="font-black text-lg text-black">
                  Laporan Nilai Masih Kosong!
                </p>
                <p className="text-sm font-semibold text-zinc-500 mt-1">
                  Belum ada user yang menyelesaikan kuis materi apa pun saat
                  ini.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-black text-white text-xs md:text-sm font-black border-2 border-black">
                      <th className="p-3 text-center w-16">RANK</th>
                      <th className="p-3">NAMA SISWA</th>
                      <th className="p-3">MATERI KUIS</th>
                      <th className="p-3 text-center">BENAR</th>
                      <th className="p-3 text-center">SALAH</th>
                      <th className="p-3 text-center">NILAI / SKOR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-black">
                    {leaderboardData.map((row, idx) => {
                      const isTop3 = idx < 3;
                      const rankColors = [
                        "bg-[#FFD700] text-black",
                        "bg-[#C0C0C0] text-black",
                        "bg-[#CD7F32] text-white",
                      ];

                      return (
                        <tr
                          key={row._id || row.id}
                          className="hover:bg-amber-50 text-xs md:text-sm font-bold border-x-2 border-b-2 border-black"
                        >
                          <td className="p-3 text-center">
                            {isTop3 ? (
                              <span
                                className={`w-8 h-8 flex items-center justify-center rounded-none border-2 border-black font-black mx-auto shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${rankColors[idx]}`}
                              >
                                {idx + 1}
                              </span>
                            ) : (
                              <span className="font-semibold text-zinc-500">
                                {idx + 1}
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-black text-black">
                            {row.username || "Anonim"}
                          </td>
                          <td className="p-3 text-purple-800 font-extrabold">
                            {row.materialName || "Materi Tanpa Judul"}
                          </td>
                          <td className="p-3 text-center text-green-700 font-black">
                            {row.correctCount ?? 0}
                          </td>
                          <td className="p-3 text-center text-red-600 font-black">
                            {row.incorrectCount ?? 0}
                          </td>
                          <td className="p-3 text-center">
                            <span className="bg-yellow-300 px-2 py-1 border-2 border-black font-black text-black text-xs md:text-sm shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]">
                              {row.score ?? 0}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 5: API SERVER CONFIGURATION ==================== */}
        {currentTab === "export" && (
          <div className="space-y-6">
            <div className="bg-white neo-border p-6 neo-shadow-lg text-black">
              <div className="flex items-center gap-2 mb-4 bg-[#F97316] p-2 border-2 border-black self-start w-fit rotate-[-1deg] text-white">
                <h2 className="text-xl font-black">
                  Konfigurasi Koneksi & Gateway API
                </h2>
              </div>

              <div className="space-y-4 font-bold text-sm leading-relaxed text-zinc-700">
                <p>
                  Secara default, aplikasi kuis ini mencari server backend Anda
                  di alamat:
                  <code className="bg-yellow-100 border border-black px-1.5 py-0.5 text-black font-black mx-1">
                    https://quis-generate-production.up.railway.app/api
                  </code>
                  .
                </p>

                <div className="bg-[#FFFBEB] border-4 border-black p-4 text-black space-y-3">
                  <label className="block text-xs font-black uppercase text-black">
                    Alamat API Server Aktif Saat Ini
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={apiBaseUrl}
                      onChange={(e) => saveCustomApiUrl(e.target.value)}
                      placeholder="Masukkan alamat custom HTTPS atau localhost Anda..."
                      className="w-full p-2.5 font-bold border-2 border-black text-xs md:text-sm focus:outline-none focus:bg-white bg-zinc-50 text-black"
                    />
                    <button
                      onClick={() => {
                        saveCustomApiUrl(
                          "https://quis-generate-production.up.railway.app/api",
                        );
                        fetchMaterials();
                      }}
                      className="bg-black hover:bg-zinc-800 text-white border-2 border-black px-4 py-2 font-black text-xs shrink-0"
                    >
                      RESET DEFAULT
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
