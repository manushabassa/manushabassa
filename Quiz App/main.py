import random
import openai
import json
import os

# Load API key from environment variable for security
openai.api_key = os.getenv('openaikey')

if not openai.api_key:
    raise EnvironmentError("Please set the OPENAI_API_KEY environment variable.")

def fetch_questions_from_chatgpt(topic, level):
    prompt = (
        f"Generate 3 {level} level quiz questions on the topic '{topic}'. "
        "Respond strictly in JSON format as a list of dictionaries, each with 'question' and 'answer'."
    )

    try:
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a helpful quiz generator."},
                {"role": "user", "content": prompt}
            ]
        )

        content = response['choices'][0]['message']['content']
        questions = json.loads(content)
        return questions

    except json.JSONDecodeError as e:
        print("Failed to decode JSON response from ChatGPT:", e)
    except Exception as e:
        print("An error occurred while fetching questions:", e)

    return []

def quiz_user(topic, level):
    questions = fetch_questions_from_chatgpt(topic, level)

    if not questions:
        print(f'No questions fetched for topic "{topic}" at level "{level}".')
        return

    random.shuffle(questions)

    for q in questions:
        input(f'Question: {q["question"]}\nYour answer (press enter to reveal): ')
        print(f'Correct Answer: {q["answer"]}\n')

def main():
    print("Welcome to the AI-Powered Quiz App!")
    topic = input("Enter topic: ")
    level = input("Choose difficulty (easy, medium, hard): ")

    quiz_user(topic, level)

if __name__ == '__main__':
    main()
