// ========================================================
// supabase-sync.js - Cloud Synchronization Pipeline
// ========================================================
import { saveEssayToDB, getDateKey } from "./script.js";

// const getUserId() = "upsc_strike";
function getUserId() { return localStorage.getItem("upscUserId")}
const SUPABASE_URL = "https://lrwporhmvjjckfbfjmyf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyd3BvcmhtdmpqY2tmYmZqbXlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMDcyMjIsImV4cCI6MjA5NzY4MzIyMn0.fBXjwQb65VQzzT7Bc4TwmjiUYNVm5ACXh8mzSTxWJ3E";
// const DB_PASSWORD = "Sivanil143!"; // <-- Enter your secret table password key here
let supabaseClient = null;

try { if (typeof supabase !== "undefined") { supabaseClient = supabase.createClient( SUPABASE_URL, SUPABASE_KEY );
    } else {
        console.error(
            "Supabase SDK not loaded"
        );
    }
} catch (error) { console.error( "Supabase Init Error:", error );
}

const STORAGE_KEY = "upscTracker";

function saveStudyHistory(data) {
    // save start day 
    const keys = Object.keys(data).sort();
    const dateObj = new Date(keys[0]);
    localStorage.setItem("startDate", dateObj.toDateString());
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(data)
    );
    let tempKey = getDateKey(new Date());
    // Using optional chaining (?.) to prevent crashes, mapping the strings, and falling back to "[]"
    localStorage.setItem("todaysSelectedBoxes_" + tempKey, JSON.stringify(data[tempKey]?.completedTopics?.map(t => t.replaceAll(" → ", "_"))) || "[]");
}

// Load from db 
async function downloadDayProgress() {
    if (!supabaseClient) return;
    try {
        const { data, error } =
            await supabaseClient
                .from("day_progress")
                .select("*")
                .eq("user_id", getUserId());;
        if (error) {
            console.error(error);
            return;
        }
        const studyHistory = {};
        data.forEach(row => {
            const dateKey =
                row.user_date_key.replace(
                    getUserId() + "_",
                    ""
                );
            studyHistory[dateKey] = {
                date: dateKey,
                studyTime: row.study_time,
                score: row.score,
                badge: row.badge,
                completedTopics:
                    row.completed_topics || [],
                dailyNotes:
                    row.daily_notes || "",
                notes:
                    row.notes || {},
                essays: row.essays || []
            };
        });
        saveStudyHistory(studyHistory)

    } catch (e) {
        console.error(e);
    }
}

async function downloadDictionary() {
    if (!supabaseClient) return;

    try {
        const { data, error } =
            await supabaseClient
                .from("dictionary")
                .select("keyword, definition")
                .eq("user_id", getUserId());;

        if (error) {
            console.error(error);
            return;
        }

        const dictionary = {};

        data.forEach(row => {

            dictionary[row.keyword] = row.definition;

        });
        localStorage.setItem("upscDictionary", JSON.stringify(dictionary));

    } catch (e) {

        console.error(e);

    }

}

async function downloadEssays() {
    if (!supabaseClient) return;

    try {
        const { data, error } =
            await supabaseClient
                .from("essays")
                .select("id, blob, type")
                .eq("user_id", getUserId());;

        if (error) {
            console.error(error);
            return;
        }
        data.forEach(item => {
        saveEssayToDB(item);
        });

    } catch (e) {

        console.error(e);

    }

}

async function syncDayToCloud(dateKey, dayData) {
    if (!supabaseClient) return;
    const uniqueUserDateKey = `${getUserId()}_${dateKey}`;
    try {
        const { error } = await supabaseClient.from("day_progress").upsert({
            user_id: getUserId(),
            user_date_key: uniqueUserDateKey,
            study_time: dayData.studyTime || 0,
            score: dayData.score || 0,
            badge: dayData.badge || "⏳",
            completed_topics: dayData.completedTopics || [],
            daily_notes: dayData.dailyNotes || "",
            notes: dayData.notes || {},
            essays: dayData.essays || []
        });
        if (error) {console.error("Cloud Progress Sync Failed:", error.message)};
    } catch (e) {
        console.error("Cloud Save Failure:", e);
    }
}

// 2. Save Custom Vocabulary Words
async function syncDictionaryToCloud(localDict) {
    if (!supabaseClient) return;
    try {
        for (const [keyword, val] of Object.entries(localDict)) {
            await supabaseClient.from("dictionary").upsert({
                user_id: getUserId(),
                keyword: keyword,
                definition: val || ""
            });
        }
    } catch (e) {
        console.error("Cloud Dictionary Sync Failure:", e);
    }
}

// 3. Insert Uploaded PDF Essay Metadata and Data Strings
async function syncEssayToCloud(blob_data) {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient.from("essays").insert(blob_data);
        if (error) console.error("Cloud Essay Upload Failed:", error.message);
        
    } catch (e) {
        console.error("Cloud Essay Sync Failure:", e);
    }
}

async function loadCloudData() {
    if (!supabaseClient) {
        console.log("disconnected");
        return;
    }
    console.log("connected");
    await downloadDayProgress();
    await downloadEssays();
    await downloadDictionary();
}
// DB load function
document
    .getElementById("loadCloudBtn")
    .addEventListener("click", async function () {
        const btn = this;
        btn.disabled = true;
        btn.classList.add("loading");
        try {
            await loadCloudData();
            location.reload();
        } catch (err) {
            console.error(err);
        } finally {
            btn.disabled = false;
            btn.classList.remove("loading");
        }
    });

export {
    syncDayToCloud,
    syncDictionaryToCloud,
    syncEssayToCloud,
    loadCloudData
};
