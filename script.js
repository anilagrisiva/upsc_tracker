import { syncDictionaryToCloud, syncDayToCloud, syncEssayToCloud, loadCloudData } from './db.js';
// ==========================================
// UPSC Tracker - Version 1.0
// ==========================================

// ------------------------------------------
// Global States and Constants
// ------------------------------------------


const STORAGE_KEY = "upscTracker";
const DICTIONARY_KEY = "upscDictionary";
const examDate = new Date("2027-04-25T00:00:00"); 
// const MY_ACCOUNT_ID = "upsc_strike";
let previousPageOpened = false;

const subjects = [
  "history",
  "geography",
  "polity",
  "economy",
  "environment",
  "science",
  "ethics",
  "csat"
];

const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes
function logout() {
    localStorage.removeItem("upscUserId");
    localStorage.clear();
}
function updateActivity() {
    localStorage.setItem("lastActiveTime", Date.now());
}
function checkTimeout() {
    const lastActive = Number(localStorage.getItem("lastActiveTime")) || 0;
    if (Date.now() - lastActive > SESSION_TIMEOUT) {
        logout();
    }
}
// Check immediately when page loads
checkTimeout();

// Get stored User ID
let MY_ACCOUNT_ID = localStorage.getItem("upscUserId");
// Ask only if not logged in
if (!MY_ACCOUNT_ID) {
    MY_ACCOUNT_ID = prompt("Enter User ID")?.trim();
    if (!MY_ACCOUNT_ID) {
        throw new Error("User ID required");
    }
    localStorage.setItem("upscUserId", MY_ACCOUNT_ID);
    await loadCloudData();
}
// User activity updates timer
["click", "mousemove", "keydown", "touchstart"].forEach(event =>
    document.addEventListener(event, updateActivity)
);
// Check every second
setInterval(checkTimeout, 1000);
// Check when returning to the tab
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        checkTimeout();
    }
});
// Start timer
updateActivity();
document.getElementById("logoutBtn").addEventListener("click", () => {
    logout();
    location.reload();
});

let syllabus = {};
let currentSubject = null;
let selectedDate = getDateKey(new Date());
let openedDate = null;
let tempStudyData = {};
let currentTopicKey = "";
let currentTopicName = "";
let currentEssayInfo = {};
let db;

const uiState = {
    selectedDate: null,
    editorOpen: false
};

// ------------------------------------------
// Initialization & Database (IndexedDB)
// ------------------------------------------
const request = indexedDB.open("UPSCVault", 1);

request.onupgradeneeded = function (event) {
    db = event.target.result;
    if (!db.objectStoreNames.contains("essays")) {
        db.createObjectStore("essays", { keyPath: "id" });
    }
};

request.onsuccess = function (event) {
    db = event.target.result;
};

request.onerror = function () {
    // Error handling block retained
};

// Load Initial Syllabus
async function loadSyllabus() {
    for (const subject of subjects) {
        try {
            const response = await fetch(`data/${subject}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load ${subject}.json`);
            }
            const data = await response.json();
            Object.assign(syllabus, data);
        } catch (error) {
            console.error(error);
        }
    }
    syncCheckboxesFromHistory();
    createSubjectList();
    updateProgress();
    generateJourneyTimeline();
    autoSaveProgress();
}

// ------------------------------------------
// Timer Component
// ------------------------------------------
function updateTopInfo() {
    const now = new Date();

    const dateStr = now.toLocaleDateString("en-IN", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
    });

    const timeStr =
        String(now.getHours()).padStart(2, "0") + ":" +
        String(now.getMinutes()).padStart(2, "0") + ":" +
        String(now.getSeconds()).padStart(2, "0") + ":" +
        String(now.getMilliseconds()).padStart(3, "0");

    let diff = examDate - now;
    if (diff < 0) diff = 0;

    const ms = diff % 1000;
    const totalSec = Math.floor(diff / 1000);
    const sec = totalSec % 60;
    const totalMin = Math.floor(totalSec / 60);
    const min = totalMin % 60;
    const totalHr = Math.floor(totalMin / 60);
    const hrs = totalHr % 24;
    const totalDays = Math.floor(totalHr / 24);
    const days = totalDays % 30;
    const months = Math.floor(totalDays / 30) % 12;
    const years = Math.floor(totalDays / 365);

    document.getElementById("topInfo").innerHTML = `
        📅 ${dateStr} 
        🎯 Exam: ${examDate.toDateString()} <br>
        ⏰ ${timeStr}
        ⏳ Remaining: ${years}y ${months}m ${days}d ${hrs}h ${min}m ${sec}s ${ms}ms
    `;
}

setInterval(updateTopInfo, 10);
updateTopInfo();

// ------------------------------------------
// Journey Timeline Component
// ------------------------------------------
function generateJourneyTimeline(centerToday = true) {
    const container = document.getElementById("journeyTimeline");
    container.innerHTML = "";

    const today = new Date();
    const todayKey = today.toDateString();

    if (!localStorage.getItem("startDate")) {
        localStorage.setItem("startDate", todayKey);
    }

    let studyHistory = loadStudyHistory();
    const startDate = new Date(localStorage.getItem("startDate"));
    const begin = new Date(startDate);
    begin.setDate(begin.getDate() - 30);
    const end = new Date(today);
    end.setDate(end.getDate() + 30);

    for (let d = new Date(begin); d <= end; d.setDate(d.getDate() + 1)) {
        const date = new Date(d); 
        const card = document.createElement("div");
        card.className = "journey-card";

        const day = date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short"
        });
        const weekday = date.toLocaleDateString("en-IN", {
            weekday: "short"
        });

        let icon = "⏳";
        const compareDate = new Date(date);
        compareDate.setHours(0, 0, 0, 0);

        const currentDate = new Date(today);
        currentDate.setHours(0, 0, 0, 0);

        if (compareDate.getTime() < currentDate.getTime()) {
            card.classList.add("completed");
            icon = "⭐";
        } else if (compareDate.getTime() === currentDate.getTime()) {
            card.classList.add("today");
            icon = "💻";
        } else {
            card.classList.add("future");
            icon = "⏳";
        }

        card.innerHTML = `
            <div class="day-icon">${icon}</div>
            <div class="day-date">${day}</div>
            <div class="day-name">${weekday}</div>
        `;

        card.addEventListener("click", () => {
            const key = getDateKey(date);
            const editor = document.getElementById("dayEditor");

            if (openedDate === key) {
                editor.classList.remove("show");
                card.classList.remove("selected");
                openedDate = null;
                selectedDate = getDateKey(new Date());
                previousPageOpened = false
                return;
            }

            document.querySelectorAll(".journey-card").forEach(card => {
                card.classList.remove("selected");
            });
            card.classList.add("selected");

            selectedDate = key;
            openedDate = key;
            openDay(key);
            editor.classList.add("show");
            previousPageOpened = true
        });

        const key = getDateKey(date);
        if (studyHistory[key]) {
            if (!card.classList.contains("today")) {
                card.classList.remove("future");
                card.classList.add("completed");
            }
            card.querySelector(".day-icon").textContent = studyHistory[key].badge;
        }
        container.appendChild(card);
    }

    if (centerToday) {
        const todayCard = [...container.children].find(c =>
            c.classList.contains("today")
        );
        if (todayCard) {
            requestAnimationFrame(() => {
                todayCard.scrollIntoView({
                    behavior: "smooth",
                    inline: "center",
                    block: "nearest"
                });
            });
        }
    }
}

// ------------------------------------------
// Syllabus & Progress Rendering
// ------------------------------------------
function createSubjectList() {
    const subjectList = document.getElementById("subjectList");
    subjectList.innerHTML = "";
    Object.keys(syllabus).forEach(subject => {
        const li = document.createElement("li");
        li.innerText = subject;
        li.onclick = () => {
            document
                .querySelectorAll("#subjectList li")
                .forEach(item => item.classList.remove("active"));
            li.classList.add("active");
            currentSubject = subject;
            renderSubject(subject);
        };
        subjectList.appendChild(li);
    });
}

function renderSubject(subject) {
    const welcome = document.getElementById("welcome");
    const container = document.getElementById("topicsContainer");

    welcome.style.display = "none";
    container.innerHTML = "";

    const title = document.createElement("h2");
    title.className = "subject-title";
    title.innerText = subject;
    container.appendChild(title);

    const chapters = syllabus[subject];
    Object.keys(chapters).forEach(chapter => {
        const chapterDiv = document.createElement("div");
        chapterDiv.className = "chapter";

        const chapterTitle = document.createElement("div");
        chapterTitle.className = "chapter-title";
        chapterTitle.innerText = chapter;

        const content = document.createElement("div");
        content.className = "chapter-content";

        chapters[chapter].forEach(topic => {
            const row = document.createElement("div");
            row.className = "topic";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";

            const key = subject + "_" + chapter + "_" + topic;
            checkbox.checked = localStorage.getItem(key) === "true";
            checkbox.onchange = () => {
                localStorage.setItem(key, checkbox.checked);
                let boxes = JSON.parse(localStorage.getItem("todaysSelectedBoxes_" + getDateKey(new Date())) || "[]");
                if (checkbox.checked) {
                    if (!boxes.includes(key)) { boxes.push(key); }
                } else {
                    boxes = boxes.filter(x => x !== key);
                }
                saveTodayCheckedBoxes(boxes);
                updateProgress();
            };

            const label = document.createElement("label");
            label.innerText = topic;

            const searchBtn = document.createElement("span");
            searchBtn.textContent = "🔍";
            searchBtn.className = "search-icon";
            searchBtn.onclick = () => {
                const query = encodeURIComponent(`${topic} in ${chapter} in ${subject} UPSC`);
                window.open(`https://www.google.com/search?q=${query}`, "_blank");
            };

            const anBtn = document.createElement("button");
            anBtn.textContent = "Write Notes";
            anBtn.className = "topic-btn";
            anBtn.onclick = () => { openNotes(subject, chapter, topic); };

            const weBtn = document.createElement("button");
            weBtn.textContent = "Add Essay";
            weBtn.className = "topic-btn";
            weBtn.onclick = () => {
                currentEssayInfo = { subject, chapter, topic, date: selectedDate };
                document.getElementById("essayTitle").value = "";
                document.getElementById("essayFiles").value = "";
                document.getElementById("essayModal").classList.add("show");
            };

            const ttBtn = document.createElement("button");
            ttBtn.textContent = "exam";
            ttBtn.className = "topic-btn";

            const leftGroup = document.createElement("div");
            leftGroup.className = "topic-left";
            leftGroup.appendChild(checkbox);
            leftGroup.appendChild(label);
            leftGroup.appendChild(searchBtn);

            const rightGroup = document.createElement("div");
            rightGroup.className = "topic-right";
            rightGroup.appendChild(anBtn);
            rightGroup.appendChild(weBtn);
            rightGroup.appendChild(ttBtn);

            row.appendChild(leftGroup);
            row.appendChild(rightGroup);
            content.appendChild(row);
        });

        chapterDiv.appendChild(chapterTitle);
        chapterDiv.appendChild(content);
        container.appendChild(chapterDiv);
    });
}

function updateProgress() {
    let total = 0;
    let completed = 0;

    Object.keys(syllabus).forEach(subject => {
        Object.keys(syllabus[subject]).forEach(chapter => {
            syllabus[subject][chapter].forEach(topic => {
                total++;
                const key = subject + "_" + chapter + "_" + topic;
                if (localStorage.getItem(key) === "true") {
                    completed++;
                }
            });
        });
    });

    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

    document.getElementById("overallProgressBar").style.width = percent + "%";
    document.getElementById("overallPercentage").innerText = percent + "%";
    document.getElementById("overallCount").innerText = completed + " / " + total + " Topics Completed";
}

// ------------------------------------------
// Core Functionality: Progress, Notes & Essays
// ------------------------------------------
function openDay(dateKey) {
    const status = getDayStatus(dateKey);
    const studyHistory = loadStudyHistory();

    if (studyHistory[dateKey]) {
        tempStudyData = structuredClone(studyHistory[dateKey]);
        tempStudyData.notes ??= {};
        tempStudyData.essays ??= [];
        tempStudyData.completedTopics ??= [];
    } else {
        tempStudyData = createDayRecord(dateKey);
    }

    document.getElementById("editorDate").textContent = "Progress On " + dateKey;
    document.getElementById("studyTime").value = tempStudyData.studyTime;
    document.getElementById("score").value = tempStudyData.score;
    document.getElementById("badge").value = tempStudyData.badge;

    const studyTime = document.getElementById("studyTime");
    const notes = document.getElementById("notes");
    renderEssayList(tempStudyData.essays || []);

    document.getElementById("completedTopics").value = tempStudyData.completedTopics.join("\n");

    let notesText = "";
    if (tempStudyData.notes && Object.keys(tempStudyData.notes).length > 0) {
        for (const [topic, note] of Object.entries(tempStudyData.notes)) {
            notesText += `🌷🌷🌷🌷🌷${topic}🌷🌷🌷🌷🌷\n${note}\n❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀❀\n`;
        }
    } else {
        notesText = "No notes available.";
    }
    document.getElementById("notes").value = notesText;
}

function saveDayProgress() {
    const status = getDayStatus(selectedDate);
    if (status === "past") {
        alert("Past records cannot be updated.");
        return;
    }
    if (status === "future") {
        alert("Future records cannot be updated.");
        return;
    }

    const studyHistory = loadStudyHistory();
    if (!studyHistory[selectedDate]) {
        studyHistory[selectedDate] = createDayRecord(selectedDate);
    }
    let updateSelectedDate = studyHistory[selectedDate]
    updateSelectedDate.studyTime = Number(document.getElementById("studyTime").value) || 0;
    updateSelectedDate.score = Number(document.getElementById("score").value);
    updateSelectedDate.badge = document.getElementById("badge").value;
    updateSelectedDate.completedTopics = getCompletedTopics();
    
    const result = findDuplicateTopics(updateSelectedDate.completedTopics, selectedDate);

    result.duplicates.forEach(item => {
        const keep = confirm(
            `Topic "${item.topic}" was already completed on ${item.date}.\n\nPress OK to KEEP it in today's progress.\n\nPress Cancel to REMOVE it from today's progress.`
        );
        if (!keep) {
            updateSelectedDate.completedTopics = updateSelectedDate.completedTopics.filter(
                topic => topic !== item.topic
            );
        }
    });

    updateSelectedDate.score = updateSelectedDate.completedTopics.length;
    if (updateSelectedDate.score >= 30) updateSelectedDate.badge = "👑";
    else if (updateSelectedDate.score >= 20) updateSelectedDate.badge = "🏆";
    else if (updateSelectedDate.score >= 10) updateSelectedDate.badge = "🔥";
    else if (updateSelectedDate.score >= 1) updateSelectedDate.badge = "📖";
    else updateSelectedDate.badge = "🚫";

    updateSelectedDate.dailyNotes = document.getElementById("notes").value;

    studyHistory[selectedDate] = updateSelectedDate;
    saveStudyHistory(studyHistory);

    syncDayToCloud(selectedDate, updateSelectedDate);  // sync to cloud db !!!!
    
    showToast("Progress saved");
    openDay(selectedDate);
}

function openNotes(subject, chapter, topic) {
    currentTopicKey = `${subject}_${chapter}_${topic}`;
    currentTopicName = topic;

    document.getElementById("notesTitle").textContent = topic;
    const history = loadStudyHistory();
    
    if (selectedDate != getDateKey(new Date())) {
        showToast("Past or records cannot be updated.");
        return;
    }
    if (!history[selectedDate]) {
        history[selectedDate] = createDayRecord(selectedDate);
    }
    if (!history[selectedDate].notes) {
        history[selectedDate].notes = {};
    }

    document.getElementById("notesText").value = history[selectedDate].notes[currentTopicKey] || "";
    document.getElementById("notesModal").classList.add("show");
}

function saveEssayToDB(item) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("essays", "readwrite");
        const store = tx.objectStore("essays");
        store.put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject();
    });
}

// exporting db
export  {saveEssayToDB, getDateKey}

function renderEssayList(essays) {
    const container = document.getElementById("essayList");
    container.innerHTML = "";

    if (essays.length === 0) {
        container.innerHTML = "<p>No Essays Uploaded</p>";
        return;
    }

    essays.forEach(essay => {
        const div = document.createElement("div");
        div.className = "essay-item";
        div.innerHTML = `
            <b>${essay.subject} → ${essay.chapter} → ${essay.topic}</b><br>
            ${essay.title}
            <button onclick="viewEssay('${essay.id}')">View</button>
            <hr>
        `;
        container.appendChild(div);
    });
}

async function getEssayImage(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction("essays", "readonly");
        const store = tx.objectStore("essays");
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function viewEssay(id) {
    const history = loadStudyHistory();
    let essay = null;

    for (const day in history) {
        if (!history[day].essays) continue;
        const found = history[day].essays.find(e => e.id === id);
        if (found) {
            essay = found;
            break;
        }
    }

    if (!essay) {
        showToast("Essay not found");
        return;
    }

    document.getElementById("viewerTitle").textContent = essay.title;
    const container = document.getElementById("viewerImages");
    container.innerHTML = "";

    for (const pdfId of essay.pdfs) {
        const data = await getEssayImage(pdfId);
        if (!data || !data.blob) continue;

        const blob = new Blob([data.blob], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);

        const iframe = document.createElement("iframe");
        iframe.src = url;
        iframe.style.width = "100%";
        iframe.style.height = "90vh";
        iframe.style.border = "none";

        container.appendChild(iframe);
    }
    document.getElementById("essayViewer").classList.add("show");
}
window.viewEssay = viewEssay;

// ------------------------------------------
// Utility Data Controllers & Synchers
// ------------------------------------------
function syncCheckboxesFromHistory() {
    Object.keys(localStorage).forEach(key => {
        if (key !== STORAGE_KEY && key !== "startDate" && key !== "todaysSelectedBoxes_" + getDateKey(new Date()) && key !== DICTIONARY_KEY   && key !== "upscUserId" && key !== "lastActiveTime") {
            localStorage.removeItem(key);
        }
    });
    const history = loadStudyHistory();
    Object.values(history).forEach(day => {
        if (!day.completedTopics) return;
        day.completedTopics.forEach(topicPath => {
            const key = topicPath.replace(/ → /g, "_");
            localStorage.setItem(key, "true");
        });
    });
}

function loadStudyHistory() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
}

function saveStudyHistory(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getDayStatus(dateKey) {
    const today = getDateKey(new Date());
    if (dateKey < today) return "past";
    if (dateKey > today) return "future";
    return "today";
}

function createDayRecord(dateKey) {
    return {
        date: dateKey,
        score: 0,
        badge: "⏳",
        studyTime: 0,
        completedTopics: [],
        dailyNotes: "",
        essayTests: {},
        notes: {}
    };
}

function getCompletedTopics() {
    const completed = [];
    let currentCheckedData = JSON.parse(localStorage.getItem("todaysSelectedBoxes_" + getDateKey(new Date())) || "[]");
    Object.keys(syllabus).forEach(subject => {
        Object.keys(syllabus[subject]).forEach(chapter => {
            syllabus[subject][chapter].forEach(topic => {
                const key = subject + "_" + chapter + "_" + topic;
                if (localStorage.getItem(key) === "true" && currentCheckedData.includes(key)) {
                    completed.push(`${subject} → ${chapter} → ${topic}`);
                }
            });
        });
    });
    return completed;
}

function findDuplicateTopics(topics, currentDate) {
    const studyHistory = loadStudyHistory();
    const duplicates = [];
    const newTopics = [];

    topics.forEach(topic => {
        let found = false;
        for (const date in studyHistory) {
            if (date === currentDate) continue;
            if (studyHistory[date].completedTopics.includes(topic)) {
                duplicates.push({ topic: topic, date: date });
                found = true;
                break;
            }
        }
        if (!found) {
            newTopics.push(topic);
        }
    });

    return { duplicates, newTopics };
}

function generateId() {
    return "id_" + Date.now() + "_" + Math.random().toString(36).slice(2);
}

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
    }, 2000);
}

function autoSaveProgress() {
    if (previousPageOpened) {
    return;
    }
    const issueDate = new Date(selectedDate);
    issueDate.setDate(issueDate.getDate() + 1);
    if (getDateKey(new Date()) === getDateKey(issueDate)) {
        selectedDate = getDateKey(issueDate)
    }
    try {
        saveDayProgress();
    } catch (e) {
        console.error("startCheck error:", e);
    }
}

function saveTodayCheckedBoxes(data) {
    localStorage.setItem("todaysSelectedBoxes_" + getDateKey(new Date()), JSON.stringify(data));
}

// ------------------------------------------
// Global DOM Event Actions (Search & Theme)
// ------------------------------------------
document.getElementById("searchBox").addEventListener("input", function () {
    const value = this.value.toLowerCase();
    const topics = document.querySelectorAll(".topic");

    topics.forEach(topic => {
        const text = topic.innerText.toLowerCase();
        if (text.includes(value)) {
            topic.style.display = "flex";
        } else {
            topic.style.display = "none";
        }
    });
});

document.getElementById("saveDayBtn").addEventListener("click", saveDayProgress);

const toggleButton = document.getElementById('theme-toggle');
if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    toggleButton.textContent = '☀️ Light';
}

toggleButton.addEventListener('click', () => {
    let theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'dark') {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        toggleButton.textContent = '🌙 Dark';
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        toggleButton.textContent = '☀️ Light';
    }
});

// Load App Syllabus Engine
loadSyllabus();
setInterval(autoSaveProgress, 1 * 60 * 1000);
// ------------------------------------------
// Contextual Modals Handlers
// ------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("saveNotesBtn").onclick = function () {
        const history = loadStudyHistory();

        if (!history[selectedDate]) {
            history[selectedDate] = createDayRecord(selectedDate);
        }
        if (!history[selectedDate].notes) {
            history[selectedDate].notes = {};
        }
        if (!history[selectedDate].completedTopics) {
            history[selectedDate].completedTopics = [];
        }

        if (!history[selectedDate].completedTopics.includes(currentTopicKey.replace(/_/g, " → "))) {
            if (!history[selectedDate].completedTopics) {
                alert("You should select and save " + currentTopicKey.replace(/_/g, " → ") + ". To add Notes !");
            } else {
                alert("Past or Future records can not be Update");
            }
        } else {
            history[selectedDate].notes[currentTopicKey] = document.getElementById("notesText").value;
            saveStudyHistory(history);
            showToast("Notes Saved");
            openDay(selectedDate);
        }

        document.getElementById("notesModal").classList.remove("show");
    };

    document.getElementById("closeNotesBtn").onclick = function () {
        document.getElementById("notesModal").classList.remove("show");
    };

    document.getElementById("closeEssayBtn").onclick = function () {
        document.getElementById("essayModal").classList.remove("show");
    };

    document.getElementById("saveEssayBtn").onclick = async function () {
        if (!db) {
            alert("DB not ready yet");
            return;
        }

        const files = document.getElementById("essayFiles").files;
        if (files.length === 0) {
            showToast("Select at least one PDF");
            return;
        }

        const title = document.getElementById("essayTitle").value.trim();
        if (!title) {
            showToast("Enter essay title");
            return;
        }

        const pdfIds = [];
        for (const file of files) {
            const id = crypto.randomUUID();
            await saveEssayToDB({id: id, blob: await file.arrayBuffer(), type: "pdf"});
            await syncEssayToCloud({user_id: MY_ACCOUNT_ID, id: id, blob: await file.arrayBuffer(), type: "pdf"})
            pdfIds.push(id);
        }

        const history = loadStudyHistory();
        if (!history[selectedDate]) {
            history[selectedDate] = createDayRecord(selectedDate);
        }
        if (!history[selectedDate].essays) {
            history[selectedDate].essays = [];
        }

        history[selectedDate].essays.push({
            id: crypto.randomUUID(),
            title: title,
            subject: currentEssayInfo?.subject || "",
            chapter: currentEssayInfo?.chapter || "",
            topic: currentEssayInfo?.topic || "",
            date: selectedDate,
            pdfs: pdfIds
        });

        saveStudyHistory(history);
        showToast("PDF Essay Saved!");
        document.getElementById("essayModal").classList.remove("show");
        openDay(selectedDate);
    };

    document.getElementById("closeViewerBtn").onclick = function () {
        document.getElementById("essayViewer").classList.remove("show");
    };

    document.getElementById("essayViewer").addEventListener("click", function (e) {
        if (e.target === this) {
            this.classList.remove("show");
        }
    });
});

// ------------------------------------------
// UPSC Floating Dictionary Component
// ------------------------------------------
function loadDictionary() {
    return JSON.parse(localStorage.getItem(DICTIONARY_KEY)) || {};
}

function saveDictionary(data) {
    localStorage.setItem(DICTIONARY_KEY, JSON.stringify(data));
}

window.addEventListener("DOMContentLoaded", () => {
    const book = document.getElementById("dictionaryBook");
    const windowBox = document.getElementById("dictionaryWindow");
    const closeBtn = document.getElementById("closeDictionary");
    const searchBox = document.getElementById("dictionarySearch");
    const keywordBox = document.getElementById("dictionaryKeyword");
    const definitionBox = document.getElementById("dictionaryDefinition");
    const saveBtn = document.getElementById("dictionarySave");
    const newBtn = document.getElementById("dictionaryNew");
    const deleteBtn = document.getElementById("dictionaryDelete");
    const results = document.getElementById("dictionaryResults");

    if (!book || !windowBox) {
        console.error("Dictionary elements missing");
        return;
    }

    const saved = JSON.parse(localStorage.getItem("dictionaryPosition"));
    if (saved) {
        book.style.left = saved.left + "px";
        book.style.top = saved.top + "px";
        book.style.right = "auto";
        book.style.bottom = "auto";
    }

    book.addEventListener("click", () => {

    if (book.dataset.dragged === "true") return;

    const isOpening = !windowBox.classList.contains("show");

    if (!isOpening) {
        windowBox.classList.remove("show");
        return;
    }

    // Temporarily show so width/height can be measured
    windowBox.classList.add("show");
    windowBox.style.visibility = "hidden";

    const rect = book.getBoundingClientRect();

    const popupWidth = windowBox.offsetWidth;
    const popupHeight = windowBox.offsetHeight;

    let left = rect.right + 15;
    let top = rect.top;

    // Not enough room on right -> open left
    if (left + popupWidth > window.innerWidth) {
        left = rect.left - popupWidth - 15;
    }

    // Still outside left edge
    if (left < 10) {
        left = 10;
    }

    // Too low -> move upward
    if (top + popupHeight > window.innerHeight) {
        top = window.innerHeight - popupHeight - 10;
    }

    // Too high
    if (top < 10) {
        top = 10;
    }

    windowBox.style.left = left + "px";
    windowBox.style.top = top + "px";
    windowBox.style.right = "auto";
    windowBox.style.bottom = "auto";

    windowBox.style.visibility = "visible";

});

    closeBtn.addEventListener("click", () => {
        windowBox.classList.remove("show");
    });

    let dragging = false;
    let moved = false;
    let offsetX = 0;
    let offsetY = 0;

    book.addEventListener("mousedown", e => {
        dragging = true;
        moved = false;
        offsetX = e.clientX - book.getBoundingClientRect().left;
        offsetY = e.clientY - book.getBoundingClientRect().top;
    });

    document.addEventListener("mousemove", e => {
        if (!dragging) return;
        moved = true;

        let x = e.clientX - offsetX;
        let y = e.clientY - offsetY;

        x = Math.max(0, Math.min(x, window.innerWidth - book.offsetWidth));
        y = Math.max(0, Math.min(y, window.innerHeight - book.offsetHeight));

        book.style.left = x + "px";
        book.style.top = y + "px";
        book.style.right = "auto";
        book.style.bottom = "auto";
    });

    document.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false;

        book.dataset.dragged = moved ? "true" : "false";
        localStorage.setItem(
            "dictionaryPosition",
            JSON.stringify({ left: book.offsetLeft, top: book.offsetTop })
        );

        setTimeout(() => {
            book.dataset.dragged = "false";
        }, 100);
    });

    function refreshResults(filter = "") {
        const dictionary = loadDictionary();
        syncDictionaryToCloud(dictionary);
        results.innerHTML = "";
        const text = filter.trim().toLowerCase();

        if (text === "") {
            return;
        }

        Object.keys(dictionary)
            .sort()
            .forEach(key => {
                if (!key.toLowerCase().includes(text) && !dictionary[key].toLowerCase().includes(text)) return;

                const div = document.createElement("div");
                div.style.padding = "8px";
                div.style.cursor = "pointer";
                div.style.borderBottom = "1px solid #ddd";
                div.innerHTML = "<b>" + key + "</b>";

                div.onclick = function () {
                    keywordBox.value = key;
                    definitionBox.value = dictionary[key];
                };
                results.appendChild(div);
            });
    }

    searchBox.addEventListener("input", function () {
        refreshResults(this.value);
    });

    saveBtn.onclick = function () {
        const keyword = keywordBox.value.trim();
        const definition = definitionBox.value.trim();

        if (keyword === "") {
            alert("Enter keyword");
            return;
        }
        if (definition === "") {
            alert("Enter definition");
            return;
        }

        const dictionary = loadDictionary();
        dictionary[keyword] = definition;
        saveDictionary(dictionary);
        syncDictionaryToCloud({keyword : definition})
        refreshResults(searchBox.value);
        alert("Saved");
    };

    newBtn.onclick = function () {
        keywordBox.value = "";
        definitionBox.value = "";
        keywordBox.focus();
    };

    deleteBtn.onclick = function () {
        const keyword = keywordBox.value.trim();
        if (keyword === "") return;

        if (!confirm("Delete '" + keyword + "' ?")) return;

        const dictionary = loadDictionary();
        delete dictionary[keyword];
        saveDictionary(dictionary);

        keywordBox.value = "";
        definitionBox.value = "";
        refreshResults();
    };
});
