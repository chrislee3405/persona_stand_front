// Imports React's useState hook, which allows the component to remember data that changes (like the list of messages and whatever the user is typing).
import { useState } from 'react';

// Creates a structural rulebook for what a single message object must look like.
interface Message {
  id: number;
  text: string;
  sender: 'user' | 'backend';
}

// Declares and exports the main component function so it can be loaded and rendered by other parts of the app.
export default function Chatroom() {

  // Creates an array in React memory to track the chat history. It starts pre-filled with two default system messages. 
  // setMessages is the specific function we call whenever we want to append a new message.
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, text: "System connected.", sender: 'backend' },
    { id: 2, text: "Hello!", sender: 'backend' }
  ]);

  //Creates a string variable in memory to track exactly what characters the user has typed inside the text box. It starts as an empty string ('').
  const [inputValue, setInputValue] = useState('');

  // Tracks if currently waiting for the backend to reply
  const [isSending, setIsSending] = useState(false);



  // This defines the processing logic that triggers when the form gets sent. The e variable holds the submission action details.
  const handleSend = async (e: React.FormEvent) => {

    e.preventDefault(); // prevent browser dafaultly refresh every time send is clicked
    if (!inputValue.trim() || isSending) return;// Check if input is empty or isSending is True, runs return execution break if so

    setIsSending(true);

    // Constructs a brand new message object using the input field data. Date.now() generates a unique ID number based on the exact millisecond the message was created.
    const newMessage: Message = {
      id: Date.now(),
      text: inputValue,
      sender: 'user'
    };

    // INSTANTLY show the user's message on the screen right away
    setMessages(prev => [...prev, newMessage]);


    const textToSend = inputValue; // Cache the input string to send to the backend
    setInputValue(''); // clear the input bar immediately

    try {
      // 1. Send raw data to backend first
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSend, sender: 'user' })
      });

      if (!response.ok) {
        throw new Error(`Server responded with status code: ${response.status}`);
      }

      // Extract the reply content object payload returned from the server
      const backendMessage: Message = await response.json();

      // put the reply message into your React state array
      setMessages(prev => [...prev, backendMessage]);

    } catch (error) {
      console.error("Server connection dropped:", error);

      // 6. FALLBACK: Create a placeholder system message alerting the client workspace interface
      const errorMessage: Message = {
        id: Date.now() + 1, // Add a tiny offset to ensure absolute uniqueness
        text: "Connection error: Failed to receive response from the negotiation terminal server.",
        sender: 'backend' // Appears labeled as the system assistant
      };

      // Push the system error message directly into the visible chat history window log array
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      // 2. Unlocks the input field and button whether the request succeeded OR failed!
      setIsSending(false);
    }
  };

  return (
    <div>
      {/* Raw Message List */}
      <div>
        {messages.map((msg) => (
          <div key={msg.id}>
            <strong>{msg.sender === 'user' ? 'You: ' : 'System: '}</strong>
            {msg.text}
          </div>
        ))}
      </div>

      {/* Raw Form Controls */}
      <form onSubmit={handleSend}>
        <input
          type="text"
          placeholder={isSending ? "Waiting for system reply..." : "Type your message here..."}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={isSending} // <-- Disables the text input bar while loading
        />
        <button type="submit" disabled={isSending}> {/* <-- Disables the button while loading */}
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}