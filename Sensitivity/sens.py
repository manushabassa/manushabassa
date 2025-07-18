import pygame
import random
import time
import matplotlib.pyplot as plt

# Initialize Pygame
pygame.init()

# Constants
WINDOW_WIDTH = 800
WINDOW_HEIGHT = 600
TARGET_RADIUS = 20
TARGET_COLOR = (255, 0, 0)
BACKGROUND_COLOR = (0, 0, 0)
FONT_COLOR = (255, 255, 255)

# Function to display the mouse DPI input
def get_mouse_dpi():
    dpi = int(input("Enter your mouse DPI (e.g., 800, 1200, 1600): "))
    print(f"Mouse DPI set to {dpi}.")
    return dpi

# Adjust mouse movement based on sensitivity
def adjust_mouse_movement(mouse_x, mouse_y, prev_x, prev_y, sensitivity_scale):
    delta_x = (mouse_x - prev_x) * sensitivity_scale
    delta_y = (mouse_y - prev_y) * sensitivity_scale
    return prev_x + delta_x, prev_y + delta_y

# Function to run sensitivity test for one sensitivity
def test_sensitivity(sensitivity, dpi):
    print(f"\nTesting sensitivity: {sensitivity:.2f}...")
    
    # Scale sensitivity with DPI
    scaled_sensitivity = sensitivity * dpi / 800  # Normalize for default 800 DPI

    # Set up the game window
    screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
    pygame.display.set_caption(f"Testing Sensitivity {sensitivity:.2f}")

    font = pygame.font.Font(None, 36)
    clock = pygame.time.Clock()

    # Initialize game variables
    targets_hit = 0
    reaction_times = []
    target_count = 10

    for _ in range(target_count):
        # Generate a random target position
        target_x = random.randint(TARGET_RADIUS, WINDOW_WIDTH - TARGET_RADIUS)
        target_y = random.randint(TARGET_RADIUS, WINDOW_HEIGHT - TARGET_RADIUS)

        # Record the start time for reaction time
        target_start_time = time.time()
        hit = False
        prev_mouse_x, prev_mouse_y = pygame.mouse.get_pos()

        # Main loop for a single target
        while not hit:
            screen.fill(BACKGROUND_COLOR)
            pygame.draw.circle(screen, TARGET_COLOR, (target_x, target_y), TARGET_RADIUS)
            pygame.display.flip()

            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    return None  # Exit the game

                if event.type == pygame.MOUSEMOTION:
                    mouse_x, mouse_y = pygame.mouse.get_pos()
                    adjusted_x, adjusted_y = adjust_mouse_movement(
                        mouse_x, mouse_y, prev_mouse_x, prev_mouse_y, scaled_sensitivity
                    )
                    prev_mouse_x, prev_mouse_y = mouse_x, mouse_y

                if event.type == pygame.MOUSEBUTTONDOWN:
                    mouse_x, mouse_y = pygame.mouse.get_pos()
                    adjusted_x, adjusted_y = adjust_mouse_movement(
                        mouse_x, mouse_y, prev_mouse_x, prev_mouse_y, scaled_sensitivity
                    )
                    distance = ((adjusted_x - target_x) ** 2 + (adjusted_y - target_y) ** 2) ** 0.5

                    if distance <= TARGET_RADIUS:  # Target hit
                        reaction_time = time.time() - target_start_time
                        reaction_times.append(reaction_time)
                        targets_hit += 1
                        hit = True  # Break out of the loop

            clock.tick(60)  # Limit to 60 FPS

    return targets_hit, sum(reaction_times) / len(reaction_times) if reaction_times else 0

# Function to run the sensitivity tests
def run_tests(dpi):
    sensitivities = [i / 10 for i in range(1, 11)]  # 0.1 to 1.0
    performance_data = []

    for sensitivity in sensitivities:
        result = test_sensitivity(sensitivity, dpi)
        if result is None:  # Exit if the user quits the game
            return None
        targets_hit, avg_reaction_time = result
        performance_data.append((sensitivity, targets_hit, avg_reaction_time))

    return performance_data

# Analyze and display results
def analyze_results(performance_data):
    sensitivities = [data[0] for data in performance_data]
    hits = [data[1] for data in performance_data]
    avg_reaction_times = [data[2] for data in performance_data]

    # Plot results
    plt.figure(figsize=(12, 6))
    plt.subplot(1, 2, 1)
    plt.plot(sensitivities, hits, marker='o')
    plt.title("Sensitivity vs. Targets Hit")
    plt.xlabel("Sensitivity")
    plt.ylabel("Targets Hit")
    plt.grid()

    plt.subplot(1, 2, 2)
    plt.plot(sensitivities, avg_reaction_times, marker='o')
    plt.title("Sensitivity vs. Average Reaction Time")
    plt.xlabel("Sensitivity")
    plt.ylabel("Reaction Time (s)")
    plt.grid()

    plt.tight_layout()
    plt.show()

    best_sensitivity = sensitivities[hits.index(max(hits))]
    print(f"\nYour best sensitivity is {best_sensitivity:.2f}, with {max(hits)} targets hit.")
    print(f"Your fastest average reaction time was {min(avg_reaction_times):.2f} seconds.")

# Main program
def main():
    dpi = get_mouse_dpi()
    performance_data = run_tests(dpi)
    if performance_data is not None:
        analyze_results(performance_data)

if __name__ == "__main__":
    main()
