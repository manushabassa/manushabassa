import random
import openai

# Configure OpenAI API key
openai.api_key = 'your_openai_api_key_here'

def fetch_questions_from_chatgpt(topic, level):
    prompt = (
        f"Generate 3 {level} level quiz questions on the topic '{topic}'. "
        "Format the response as a list of dictionaries with 'question' and 'answer' keys."
    )
    
    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": "You are a helpful quiz generator."},
            {"role": "user", "content": prompt}
        ]
    )
    
    content = response.choices[0].message['content']
    try:
        questions = eval(content)
    except Exception as e:
        print("Failed to parse questions from ChatGPT:", e)
        questions = []
    
    return questions

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
