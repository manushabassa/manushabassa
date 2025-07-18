import tkinter as tk
from tkinter import filedialog
from PIL import Image, ImageTk
import pygame
import time
import threading
import os
import random
from tkinter import font

class PomodoroApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Custom Pomodoro App")
        self.root.geometry("800x600")
        self.timer_running = False
        self.seconds_left = 0
        self.bg_image = None
        self.timer_paused = False

        pygame.mixer.init()
        self.music_files = []
        self.current_track_index = 0
        self.is_paused = False

        # Fonts
        self.custom_font_title = ("Bebas Neue", 36)
        self.custom_font_entry = ("Montserrat", 14)

        self.setup_ui()

    def toggle_timer_pause(self):
        if self.timer_running:
            self.timer_paused = not self.timer_paused


    def setup_ui(self):
        self.canvas = tk.Canvas(self.root, width=800, height=600)
        self.canvas.pack(fill="both", expand=True)

        # Timer
        self.timer_label = tk.Label(self.root, text="00:00", font=self.custom_font_title, bg="white")
        self.timer_label.place(relx=0.5, rely=0.3, anchor=tk.CENTER)

        self.time_entry = tk.Entry(self.root, width=5, font=self.custom_font_entry)
        self.time_entry.place(relx=0.5, rely=0.4, anchor=tk.CENTER)
        self.time_entry.insert(0, "25")

        # Start Timer Button
        tk.Button(self.root, text="Start", font=self.custom_font_entry, command=self.start_timer).place(relx=0.5, rely=0.5, anchor=tk.CENTER)
        tk.Button(self.root, text="Pause/Resume", font=self.custom_font_entry, command=self.toggle_timer_pause).place(relx=0.5, rely=0.55, anchor=tk.CENTER)

        # Background & Folder
        tk.Button(self.root, text="🖼️", font=("Arial", 14), command=self.set_background).place(relx=0.15, rely=0.9, anchor=tk.CENTER)
        tk.Button(self.root, text="📁", font=("Arial", 14), command=self.import_music_folder).place(relx=0.25, rely=0.9, anchor=tk.CENTER)

        # Music Controls
        tk.Button(self.root, text="⏮️", font=("Arial", 14), command=self.prev_song).place(relx=0.40, rely=0.9, anchor=tk.CENTER)
        tk.Button(self.root, text="⏯️", font=("Arial", 14), command=self.toggle_pause).place(relx=0.50, rely=0.9, anchor=tk.CENTER)
        tk.Button(self.root, text="⏭️", font=("Arial", 14), command=self.next_song).place(relx=0.60, rely=0.9, anchor=tk.CENTER)

    def set_background(self):
        file_path = filedialog.askopenfilename(filetypes=[("Image Files", "*.png *.jpg *.jpeg")])
        if file_path:
            image = Image.open(file_path)
            image = image.resize((800, 600), Image.Resampling.LANCZOS)
            self.bg_image = ImageTk.PhotoImage(image)
            self.canvas.create_image(0, 0, image=self.bg_image, anchor=tk.NW)

    def import_music_folder(self):
        folder_selected = filedialog.askdirectory()
        if folder_selected:
            self.music_files = [os.path.join(folder_selected, f) for f in os.listdir(folder_selected)
                                if f.lower().endswith(('.mp3', '.wav'))]
            random.shuffle(self.music_files)
            self.current_track_index = 0
            self.play_music()

    def play_music(self):
        if self.music_files and 0 <= self.current_track_index < len(self.music_files):
            track = self.music_files[self.current_track_index]
            pygame.mixer.music.load(track)
            pygame.mixer.music.play()
            pygame.mixer.music.set_endevent(pygame.USEREVENT)
            self.root.after(1000, self.check_music_end)

    def check_music_end(self):
        if not pygame.mixer.music.get_busy() and not self.is_paused:
            self.current_track_index += 1
            if self.current_track_index < len(self.music_files):
                self.play_music()
        else:
            self.root.after(1000, self.check_music_end)

    def toggle_pause(self):
        if pygame.mixer.music.get_busy():
            if not self.is_paused:
                pygame.mixer.music.pause()
                self.is_paused = True
            else:
                pygame.mixer.music.unpause()
                self.is_paused = False

    def next_song(self):
        if self.music_files:
            self.current_track_index += 1
            if self.current_track_index >= len(self.music_files):
                self.current_track_index = 0
            self.play_music()

    def prev_song(self):
        if self.music_files:
            self.current_track_index -= 1
            if self.current_track_index < 0:
                self.current_track_index = len(self.music_files) - 1
            self.play_music()

    def start_timer(self):
        if self.timer_running:
            return
        try:
            minutes = int(self.time_entry.get())
            self.seconds_left = minutes * 60
            self.timer_running = True
            threading.Thread(target=self.countdown).start()
        except ValueError:
            self.timer_label.config(text="Invalid time")

    def countdown(self):
        while self.seconds_left > 0 and self.timer_running:
            if not self.timer_paused:
                mins, secs = divmod(self.seconds_left, 60)
                self.timer_label.config(text=f"{mins:02d}:{secs:02d}")
                time.sleep(1)
                self.seconds_left -= 1
            else:
                time.sleep(0.5)  # short sleep to prevent freezing the thread

        if self.seconds_left == 0:
            self.timer_label.config(text="Time's up!")
            self.timer_running = False


if __name__ == "__main__":
    root = tk.Tk()
    app = PomodoroApp(root)
    root.mainloop()
