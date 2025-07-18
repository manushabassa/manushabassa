import pygame
import sys
import time

print(" __  __    _    _   _ _   _ ____  _   _    _")
print("|  \/  |  / \  | \ | | | | / ___|| | | |  / \\")
print("| |\/| | / _ \ |  \| | | | \___ \| |_| | / _ \\")
print("| |  | |/ ___ \| |\  | |_| |___) |  _  |/ ___ \\")
print("|_|  |_/_/   \_\_| \_|\___/|____/|_| |_/_/   \_\\")

print(" ____  ____  _____ _____ ____    ____  _____    _    ____  _____ ____")
print("/ ___||  _ \| ____| ____|  _ \  |  _ \| ____|  / \  |  _ \| ____|  _ \\")
print("\___ \| |_) |  _| |  _| | | | | | |_) |  _|   / _ \ | | | |  _| | |_) |")
print(" ___) |  __/| |___| |___| |_| | |  _ <| |___ / ___ \| |_| | |___|  _ <")
print("|____/|_|   |_____|_____|____/  |_| \_\_____/_/   \_\____/|_____|_| \_\\")

# Initialize Pygame
pygame.init()

# Define the window dimensions
window_width = 800
window_height = 400

# Set up the display
screen = pygame.display.set_mode((window_width, window_height))
pygame.display.set_caption("Manusha Speed Reader")

# Define font and colors
font_size = 80
font = pygame.font.Font(pygame.font.match_font('arial'), font_size)
text_color = (255, 255, 255)  # White
background_color = (0, 0, 0)  # Black

# Function to render and display text
def render_text(word):
    screen.fill(background_color)  # Clear the screen
    text_surface = font.render(word, True, text_color)
    text_rect = text_surface.get_rect(center=(window_width // 2, window_height // 2))
    screen.blit(text_surface, text_rect)
    pygame.display.flip()  # Update the display

# Step 1: Get multi-line input
print("Enter your passage. Press Ctrl+D (or Ctrl+Z on Windows) to finish input:")

# Read all input lines from the user
speeder_input = sys.stdin.read()  # Read until EOF (Ctrl+D or Ctrl+Z)

# Step 2: Normalize input by replacing newlines with spaces
normalized_input = speeder_input.replace("\n", " ")

# Step 3: Split input into words and filter out words with hyphens
words = [word for word in normalized_input.split() if "-" not in word]

# Step 4: Calculate delay between words for 200 words per minute
delay = 60 / 200  # seconds per word
word_index = 0

# Main loop
running = True
last_update_time = time.time()  # Track time for delay
while running:
    # Process Pygame events
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    # Render the next word based on the timer
    current_time = time.time()
    if current_time - last_update_time >= delay and word_index < len(words):
        render_text(words[word_index])
        word_index += 1
        last_update_time = current_time

    # Exit when all words are displayed
    if word_index >= len(words):
        running = False

# Clean up
pygame.quit()