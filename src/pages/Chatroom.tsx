import { useState } from 'react'; //react interactive feature engine
import type { BaseSyntheticEvent } from 'react';
import { useChat } from '../context/ChatContext';

// Creates schema for message object
interface Message {
  id: number;
  text: string;
  sender: 'user' | 'backend';
}

// Declares and exports the main component function so it can be loaded and rendered by other parts of the app.
export default function Chatroom() {

  // Creates an array in React memory to track the chat history.
  // setMessages is the specific function being called whenever needed to append a new message.
  const { messages, setMessages, setCode } = useChat();

  const [inputMessage, setInputMessage] = useState(''); //Creates a string variable in memory to track exactly what characters the user has typed inside the text box. It starts as an empty string ('').
  const [isSending, setIsSending] = useState(false); // Tracks if currently waiting for the backend to reply


  const [inputCode, setInputCode] = useState('');
  const [isVerifyingCode, setIsVerifyingCode] = useState(false); // check the Verifying process, only true when Verifying is processing
  const [isInvite, setIsInvite] = useState(false); // check the Verify status, true after code have valid Verify result
  const [isWrongCode, setIsWrongCode] = useState(false);



  // The processing logic that triggers when the form gets sent. 'e'  holds the submission action details.
  const handleSend = async (e: BaseSyntheticEvent) => {

    e.preventDefault(); // prevent browser dafaultly refresh every time send is clicked
    if (!inputMessage.trim() || isSending) return;// Check if input is empty or isSending is True, runs return execution break if so
    setIsSending(true);

    const newMessage: Message = { // Constructs a brand new message object using the input field data.
      id: Date.now(), // generates a unique ID number based on the exact millisecond the message was created.
      text: inputMessage,
      sender: 'user'
    };

    setMessages(prev => [...prev, newMessage]); // INSTANTLY show the user's message on the chat window 
    const textToSend = inputMessage; // Cache the input string to send to the backend
    setInputMessage(''); // clear the input bar immediately

    try {

      let response;
      if (!isInvite) {//Route the request based on the user's invite status
        response = await fetch('/api/guestchat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textToSend, sender: 'user' })
        });
      } else {
        response = await fetch('/api/invitechat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textToSend, sender: 'user' })
        });
      }

      if (!response.ok) {
        throw new Error(`Server responded with status code: ${response.status}`);
      }

      const backendMessage: Message = await response.json();// Extract the reply content object payload returned from the server
      setMessages(prev => [...prev, backendMessage]); // Push the reply message into React state array

    } catch (error) {
      console.error("Server connection dropped:", error);
      const errorMessage: Message = { // Create a pre-set system message when error occur
        id: Date.now() + 1, // Add a tiny offset to ensure absolute uniqueness
        text: "Connection error: Failed to receive response from the negotiation terminal server.",
        sender: 'backend' // Appears labeled as the system assistant
      };
      setMessages(prev => [...prev, errorMessage]); // Push the system error message directly into the chat window
    } finally {
      setIsSending(false); //Unlocks the input field and button whether the request succeeded OR failed!
    }
  };




  const handleCode = async (e: BaseSyntheticEvent) => {

    e.preventDefault(); // prevent browser dafaultly refresh every time send is clicked
    if (!inputCode.trim() || isInvite || isVerifyingCode) return; // return if input is empty; verifying is processing; user already verified
    setIsVerifyingCode(true);

    const codeToSend = inputCode.trim(); // Caches inputCode, not inputMessage!
    setInputCode(''); // Clears the code box instead of the chat box!

    try {
      const response = await fetch('/api/code', { // Send raw code to backend first
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_code: codeToSend })
      });

      const data = await response.json();

      if (!response.ok) {
        setIsWrongCode(true)
        throw new Error(`Server responded with status code: ${response.status}`);
      } else {
        // If reached here, validation passed perfectly!
        setIsInvite(true);
        setIsWrongCode(false);
        setInputCode(data.returned_result);
        setCode(codeToSend);
      }


    } catch (error) {
      console.error("Server validation error:", error);
      if (!isWrongCode) {
        alert("System connection error. Please verify network access.");
      }
    } finally {
      setIsVerifyingCode(false);
    }
  }

  // ************************************************************************************************************************
  // ************************************************************************************************************************

  return (
    <div>

      {/* Invite code Controls */}
      <form onSubmit={handleCode}>
        <input
          type="text"
          placeholder={
            isWrongCode
              ? "Invite code not found! Try again."
              : isInvite
                ? "Access Granted via Invite"
                : isVerifyingCode
                  ? "Verifying code..."
                  : "Type your invite code here (if any)"
          }
          value={inputCode}
          onChange={(e) => {
            setInputCode(e.target.value);
            if (isWrongCode) setIsWrongCode(false);
          }}
          disabled={isVerifyingCode || isInvite}
        />
        <button type="submit" disabled={isVerifyingCode || isInvite}>
          {isVerifyingCode ? 'Checking...' : 'Verify Code'}
        </button>
      </form>



      {/* Raw Message List */}
      <div>
        {messages.map((msg) => (
          <div key={msg.id}>
            <strong>{msg.sender === 'user' ? 'You: ' : 'System: '}</strong>
            {msg.text}
          </div>
        ))}
      </div>




      {/* Chat Form Controls */}
      <form onSubmit={handleSend}>
        <input
          type="text"
          placeholder={isSending ? "Waiting for system reply..." : "Type your message here..."}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          disabled={isSending} // <-- Disables the text input bar while loading
        />
        <button type="submit" disabled={isSending}> {/* <-- Disables the button while loading */}
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
