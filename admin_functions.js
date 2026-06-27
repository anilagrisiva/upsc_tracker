import {supabaseClient} from "./db.js"


async function deleteDictionaryWord(keyword){

    const { error } = await supabaseClient
        .from("dictionary")
        .delete()
        .eq(
            "user_keyword_key",
            "upsc_strike_" + keyword
        );

    console.log(error || "Deleted");
}

export {
    deleteDictionaryWord
}