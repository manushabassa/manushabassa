# main.py
import os, json, uuid, time
from datetime import datetime
from typing import List, Dict, Any, Optional

import speech_recognition as sr
import pyttsx3

# OpenAI SDK
from openai import OpenAI

DATA_FILE = "todo.json"

# ---------------- ToDo storage ----------------
class TodoList:
    def __init__(self, path: str = DATA_FILE):
        self.path = path
        self.tasks: List[Dict[str, Any]] = []
        self._load()

    def _load(self):
        if os.path.exists(self.path):
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    self.tasks = json.load(f)
            except Exception:
                self.tasks = []
        else:
            self._save()

    def _save(self):
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self.tasks, f, indent=2)

    def add(self, title: str, due: Optional[str] = None, priority: Optional[str] = None) -> Dict[str, Any]:
        task = {
            "id": str(uuid.uuid4())[:8],
            "title": title.strip(),
            "done": False,
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "due": due,
            "priority": priority or "normal"
        }
        self.tasks.append(task)
        self._save()
        return task

    def list(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        if status == "done":
            return [t for t in self.tasks if t["done"]]
        if status == "todo":
            return [t for t in self.tasks if not t["done"]]
        return list(self.tasks)

    def complete(self, task_id_or_text: str) -> Optional[Dict[str, Any]]:
        t = self._find(task_id_or_text)
        if t:
            t["done"] = True
            t["completed_at"] = datetime.now().isoformat(timespec="seconds")
            self._save()
        return t

    def delete(self, task_id_or_text: str) -> Optional[Dict[str, Any]]:
        t = self._find(task_id_or_text)
        if t:
            self.tasks = [x for x in self.tasks if x["id"] != t["id"]]
            self._save()
        return t

    def prioritize(self, task_id_or_text: str, priority: str) -> Optional[Dict[str, Any]]:
        t = self._find(task_id_or_text)
        if t:
            t["priority"] = priority
            self._save()
        return t

    def _find(self, key: str) -> Optional[Dict[str, Any]]:
        key_lower = key.lower().strip()
        # Try by id prefix
        for t in self.tasks:
            if t["id"].startswith(key_lower):
                return t
        # Fuzzy by title contains
        candidates = [t for t in self.tasks if key_lower in t["title"].lower()]
        return candidates[0] if candidates else None


# ---------------- Voice I/O ----------------
class VoiceIO:
    def __init__(self):
        self.recognizer = sr.Recognizer()
        self.engine = pyttsx3.init()
        # Tweak speaking rate and volume as needed
        self.engine.setProperty("rate", 185)
        self.engine.setProperty("volume", 0.95)

    def speak(self, text: str):
        try:
            self.engine.say(text)
            self.engine.runAndWait()
        except Exception:
            # fall back to printing if TTS hiccups
            print(f"[TTS] {text}")

    def listen_once(self, prompt: Optional[str] = None, timeout: int = 6, phrase_time_limit: int = 12) -> Optional[str]:
        if prompt:
            print(prompt)
            self.speak(prompt)
        with sr.Microphone() as source:
            self.recognizer.adjust_for_ambient_noise(source, duration=0.6)
            print("🎙️  Listening...")
            try:
                audio = self.recognizer.listen(source, timeout=timeout, phrase_time_limit=phrase_time_limit)
            except sr.WaitTimeoutError:
                print("No speech detected.")
                return None
        try:
            text = self.recognizer.recognize_google(audio)
            print(f"🗣️  You said: {text}")
            return text
        except sr.UnknownValueError:
            print("Sorry, I could not understand.")
            return None
        except sr.RequestError as e:
            print(f"Speech service error: {e}")
            return None


# ---------------- GPT Router (function-calling) ----------------
class GPTPlanner:
    """
    Uses Chat Completions function calling to map freeform text to to-do actions.
    """
    def __init__(self, model: str = os.getenv("OPENAI_MODEL", "gpt-5-mini")):
        self.client = OpenAI()
        self.model = model

        self.tools = [
            {
                "type": "function",
                "function": {
                    "name": "add_task",
                    "description": "Add a to-do item. Accepts a title and optional due date and priority.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "due": {"type": "string", "nullable": True, "description": "Due date as natural text, e.g., 'tomorrow 5pm'"},
                            "priority": {"type": "string", "enum": ["low", "normal", "high"], "nullable": True}
                        },
                        "required": ["title"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "list_tasks",
                    "description": "List tasks filtered by status.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "status": {"type": "string", "enum": ["todo", "done", "all"], "default": "todo"}
                        }
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "complete_task",
                    "description": "Mark a task as done by id prefix or by text.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "id prefix or words from the title"}
                        },
                        "required": ["query"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "delete_task",
                    "description": "Delete a task by id prefix or by text.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"}
                        },
                        "required": ["query"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "prioritize_task",
                    "description": "Set priority of a task.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                            "priority": {"type": "string", "enum": ["low", "normal", "high"]}
                        },
                        "required": ["query", "priority"]
                    }
                }
            }
        ]

    def route(self, user_text: str) -> Dict[str, Any]:
        """
        Returns a dict like {"action":"add_task","args":{...}} or {"action":"list_tasks","args":{"status":"todo"}}
        If the model returns plain text, we treat it as small talk.
        """
        system = (
            "You are a concise to-do assistant. "
            "Convert the user's request into exactly one function call among the provided tools. "
            "If the user asks a general question unrelated to tasks, do not call a tool and answer briefly."
        )
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_text}
            ],
            tools=self.tools,
            tool_choice="auto",
            temperature=0.2,
        )  # Chat Completions with tool calls. :contentReference[oaicite:1]{index=1}

        msg = resp.choices[0].message
        if getattr(msg, "tool_calls", None):
            tc = msg.tool_calls[0]
            action = tc.function.name
            args = json.loads(tc.function.arguments or "{}")
            return {"action": action, "args": args, "smalltalk": None}
        # No tool call, model replied with text
        return {"action": None, "args": {}, "smalltalk": msg.content or ""}


# ---------------- App wiring ----------------
class TodoApp:
    def __init__(self, voice: bool = True, model: str = "gpt-5-mini"):
        self.todos = TodoList()
        self.voice = VoiceIO() if voice else None
        self.router = GPTPlanner(model=model)

    def say(self, text: str):
        print(text)
        if self.voice:
            self.voice.speak(text)

    def handle(self, text: str):
        routed = self.router.route(text)
        action = routed["action"]
        args = routed["args"]
        smalltalk = routed["smalltalk"]

        if not action:
            if smalltalk:
                self.say(smalltalk)
            else:
                self.say("I did not get that.")
            return

        if action == "add_task":
            t = self.todos.add(args["title"], due=args.get("due"), priority=args.get("priority"))
            self.say(f"Added [{t['id']}] {t['title']} with priority {t['priority']}" + (f", due {t['due']}" if t['due'] else ""))

        elif action == "list_tasks":
            status = args.get("status", "todo")
            items = self.todos.list(status if status != "all" else None)
            if not items:
                self.say("Nothing to show.")
                return
            lines = []
            for t in items:
                flag = "✅" if t["done"] else "⬜"
                due = f"  due: {t['due']}" if t.get("due") else ""
                lines.append(f"{flag} [{t['id']}] ({t['priority']}) {t['title']}{due}")
            self.say("\n".join(lines))

        elif action == "complete_task":
            t = self.todos.complete(args["query"])
            self.say(f"Completed [{t['id']}] {t['title']}" if t else "Could not find that task.")

        elif action == "delete_task":
            t = self.todos.delete(args["query"])
            self.say(f"Deleted [{t['id']}] {t['title']}" if t else "Could not find that task.")

        elif action == "prioritize_task":
            t = self.todos.prioritize(args["query"], args["priority"])
            self.say(f"Set priority to {args['priority']} for [{t['id']}] {t['title']}" if t else "Could not find that task.")

        else:
            self.say("Action not implemented.")

    def run_cli(self):
        banner = (
            "\nTo-Do + Voice + GPT\n"
            "Say things like:\n"
            "  - add buy milk tomorrow high\n"
            "  - list tasks\n"
            "  - complete milk\n"
            "  - delete 1a2b\n"
            "  - prioritize project report high\n"
            "Press Enter to speak, or type text and hit Enter.\n"
            "Type 'quit' to exit.\n"
        )
        print(banner)
        if self.voice:
            self.voice.speak("To do assistant ready.")

        while True:
            try:
                typed = input("> ").strip()
            except (KeyboardInterrupt, EOFError):
                print("\nBye.")
                break

            if typed.lower() in {"quit", "exit"}:
                self.say("Goodbye.")
                break

            if typed == "" and self.voice:
                heard = self.voice.listen_once(prompt="What do you want to do?")
                if not heard:
                    continue
                self.handle(heard)
            else:
                self.handle(typed)


if __name__ == "__main__":
    # You can force voice off by setting USE_VOICE=0
    use_voice = os.getenv("USE_VOICE", "1") != "0"
    model = os.getenv("OPENAI_MODEL", "gpt-5-mini")
    if not os.getenv("OPENAI_API_KEY"):
        print("Set OPENAI_API_KEY in your environment.")
        exit(1)
    app = TodoApp(voice=use_voice, model=model)
    app.run_cli()
