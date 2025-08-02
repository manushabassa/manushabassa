import os
from pytube import YouTube
from moviepy.editor import VideoFileClip
import speech_recognition as sr

def download_youtube_captions(video_url):
    yt = YouTube(video_url)
    print(f"Video Title: {yt.title}")
    
    # Try to download English subtitles
    if 'en' in yt.captions:
        caption = yt.captions['en']
        script = caption.generate_srt_captions()
        with open("youtube_script.txt", "w", encoding="utf-8") as f:
            f.write(script)
        print("✅ Captions downloaded to youtube_script.txt")
    else:
        print("⚠️ No captions found. Proceeding with audio transcription...")
        return False
    return True

def transcribe_video_audio(video_path):
    print("🎧 Extracting audio...")
    clip = VideoFileClip(video_path)
    clip.audio.write_audiofile("temp_audio.wav")

    print("🧠 Transcribing...")
    recognizer = sr.Recognizer()
    with sr.AudioFile("temp_audio.wav") as source:
        audio_data = recognizer.record(source)

        try:
            text = recognizer.recognize_google(audio_data)
            with open("transcribed_script.txt", "w", encoding="utf-8") as f:
                f.write(text)
            print("✅ Script saved to transcribed_script.txt")
        except sr.UnknownValueError:
            print("❌ Speech Recognition couldn't understand the audio")
        except sr.RequestError as e:
            print(f"❌ Could not request results from Google Speech Recognition service; {e}")
    
    os.remove("temp_audio.wav")

# MAIN FUNCTION
def scrape_script(video_source):
    if video_source.startswith("http"):
        success = download_youtube_captions(video_source)
        if not success:
            yt = YouTube(video_source)
            stream = yt.streams.filter(file_extension='mp4').first()
            video_path = stream.download(filename="temp_video.mp4")
            transcribe_video_audio("temp_video.mp4")
            os.remove("temp_video.mp4")
    else:
        transcribe_video_audio(video_source)

# Example Usage
if __name__ == "__main__":
    # YouTube or Local file
    source = input("Enter YouTube URL or local video path: ").strip()
    scrape_script(source)
