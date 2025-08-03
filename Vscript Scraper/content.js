// This will be injected into the YouTube page
function getCaptionsFromPage() {
  const tracks = document.querySelectorAll("track[kind='subtitles']");
  if (tracks.length > 0) {
    const trackURL = tracks[0].src;
    fetch(trackURL)
      .then((res) => res.text())
      .then((xmlText) => {
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlText, "text/xml");
        const texts = xml.querySelectorAll("text");
        let transcript = "";

        texts.forEach((t) => {
          transcript += `${t.textContent.trim()}\n`;
        });

        downloadTextFile(transcript, "youtube_script.txt");
      });
  } else {
    alert("⚠️ No subtitles available for this video.");
  }
}

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "scrape_script") {
    getCaptionsFromPage();
  }
});
