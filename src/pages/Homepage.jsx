import React, { useEffect, useState, useRef } from "react";
import styles from './Homepage.module.css'
import axios from 'axios';

export default function Homepage() {
  // variables for sessionID
  const [sessionIdInput, setSessionIdInput] = useState("");
  const [activeSessionId, setActiveSessionId] = useState(null);

  // variables for chat
  const [sessionChat, setSessionChat] = useState([]);
  const [userMessageToChat, setUserMessageToChat] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const scrollChatToCurrent = useRef(null);

  const backendUrl = 'http://localhost:5000'; // Ensure this matches your backend's port

  // To scroll chat to current message
  useEffect(() => {
    if (scrollChatToCurrent.current) {
      scrollChatToCurrent.current.scrollTop = scrollChatToCurrent.current.scrollHeight;
    }
  }, [sessionChat]);

  // Formats chat for display
  const formatChatForDisplay = () => {
    return sessionChat.map(entry => {
      const speaker = entry.role === 'user' ? 'You' : 'Advisor';
      return `${speaker}: ${entry.parts[0].text}`;
    }).join('\n\n');
  }

  // --- Connecting to the backend ---

  // Handles starting a new session or continuing an existing one
  const submitSessionId = async (e) => {
    e.preventDefault();

    setIsLoading(true);
    setError(null);

    const sessionIdToLoad = sessionIdInput.trim();
    console.log(`Attempting to ${sessionIdToLoad ? 'load' : 'start new'} session...`);

    try {
      let response;
      if (sessionIdToLoad) {
        response = await axios.get(`${backendUrl}/session?sessionId=${sessionIdToLoad}`);
      } else {
        response = await axios.get(`${backendUrl}/session`);
      }

      const { sessionId: receivedSessionId, conversationHistory: loadedHistory, initialGreeting } = response.data;

      setActiveSessionId(receivedSessionId);

      let currentChatHistory = loadedHistory || [];
      setSessionChat(currentChatHistory);

      const shouldSendInitialMessage = !sessionIdToLoad && (currentChatHistory === null || currentChatHistory.length === 0);

      if (!sessionIdToLoad) {
        alert(`New Session Started! Your Session ID is: ${receivedSessionId}. Please copy this down if you want to resume later.`);
      } else {
        alert(`Session ${receivedSessionId} loaded successfully. Let's continue!`);
      }

      setSessionIdInput("");

      //start of second call
      if (shouldSendInitialMessage) {
        console.log("Sending initial message to chat endpoint for new session...");
        
        // Define the initial user message that will trigger the AI's first response
        // You can change "start_conversation" to anything your backend's AI expects as a trigger
        const initialUserPrompt = { role: "user", parts: [{ text: "start_conversation" }] };

        // Optimistically add this initial prompt to the chat display immediately
        // This makes the UI feel more responsive
        // setSessionChat(prevChat => [...prevChat, initialUserPrompt]);

        try {
          // Send the request to the /chat endpoint
          // Include the received session ID and the full conversation (current history + new prompt)
          const chatResponse = await axios.post(`${backendUrl}/chat`, {
            sessionId: receivedSessionId,
            contents: [...currentChatHistory, initialUserPrompt], // Combine existing history with the new prompt
          });

          // Update the frontend chat state with the full conversation history returned from the chat endpoint
          // This will include the AI's greeting response
          
          
          let returnedConversationHistoryFromChat = chatResponse.data.conversationHistory;

          // --- ADD THE FILTERING CODE HERE ---
          // This code filters out the "start_conversation" message before updating the UI
          if (returnedConversationHistoryFromChat.length > 0 &&
              returnedConversationHistoryFromChat[0].role === 'user' &&
              returnedConversationHistoryFromChat[0].parts &&
              returnedConversationHistoryFromChat[0].parts[0] &&
              returnedConversationHistoryFromChat[0].parts[0].text === "start_conversation") {
              
              returnedConversationHistoryFromChat = returnedConversationHistoryFromChat.slice(1);
          }
          // --- END OF FILTERING CODE ---

          // Update the frontend chat state with the FILTERED conversation history
          setSessionChat(returnedConversationHistoryFromChat);

        } catch (chatErr) {
          console.error("Error sending initial chat message:", chatErr);
          // Handle errors if the initial chat message exchange fails
          const chatErrorMessage = 'Failed to get initial AI greeting. Please type a message to start.';
          setError(chatErrorMessage);
          alert(chatErrorMessage);
          // Optionally revert the optimistically added prompt if it failed:
          // setSessionChat(currentChatHistory); 
        }
      }
      // --- END NEW LOGIC ---



    } catch (err) {
      console.error("Error starting/loading session:", err);
      let messageToDisplay;
      if (err.response && err.response.status === 404) {
        messageToDisplay = "Session ID not found. Please check the ID you input and try again, or leave it blank to start a new session.";
      } else {
        messageToDisplay = "Failed to connect to session service. Please try again later.";
      }
      alert(messageToDisplay);
      setError(messageToDisplay);

      setActiveSessionId(null);
      setSessionChat([]);
    } finally {
      setIsLoading(false);
    }
  };


  // --- Handles submitting user message and sends data to the backend ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Ensure an active session exists
    if (!activeSessionId) {
      const messageToDisplay = "Please start or load a session first.";
      setError(messageToDisplay);
      alert(messageToDisplay);
      return;
    }

    // Ensure there's a message to send
    if (!userMessageToChat.trim()) {
      const messageToDisplay = "Please type a message to send.";
      setError(messageToDisplay);
      alert(messageToDisplay);
      return;
    }

    setIsLoading(true);

    // Formatting user's message for backend
    const newUserMessage = { role: "user", parts: [{ text: userMessageToChat.trim() }] };
    // Optimistically update chat with user's message
    const updatedChatForFrontend = [...sessionChat, newUserMessage];
    setSessionChat(updatedChatForFrontend);
    setUserMessageToChat(""); // Clear input immediately

    try {
      const response = await axios.post(`${backendUrl}/chat`, {
        sessionId: activeSessionId,
        contents: updatedChatForFrontend,
      });

      const aiResponse = response.data.aiResponse;
      
      let returnedConversationHistory = response.data.conversationHistory;

      // Filtering logic to hide the "start_conversation" message here as well,
      // ensuring it remains hidden on subsequent message submissions.
      if (returnedConversationHistory.length > 0 && 
          returnedConversationHistory[0].role === 'user' &&
          returnedConversationHistory[0].parts &&
          returnedConversationHistory[0].parts[0] &&
          returnedConversationHistory[0].parts[0].text === "start_conversation") {
          
          returnedConversationHistory = returnedConversationHistory.slice(1);
      }

      setSessionChat(returnedConversationHistory);

    } catch (err) {
      console.error("Error sending message:", err);
      const messageToDisplay = 'Failed to get an AI response. Please try again.';
      setError(messageToDisplay);
      alert(messageToDisplay);
      setSessionChat(sessionChat); // Revert chat to previous state if submission fails
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className={styles.outsideAiContainer}>
      <div className={styles.interviewWrapper}>
        <form onSubmit={handleSubmit}>
          {/* jobTitle input and state removed */}

          <input
            type="text"
            className={styles.userSessionIdInput}
            placeholder="Previous Session ID (optional)"
            onChange={(e) => setSessionIdInput(e.target.value)}
            disabled={isLoading || activeSessionId}
            value={sessionIdInput}
          />

          <textarea
            ref={scrollChatToCurrent}
            name="mainChatContainer"
            className={styles.mainChatContainer}
            value={formatChatForDisplay()}
            readOnly
            rows={15}
            cols={60}
            placeholder={activeSessionId ? "Type your message below..." : "To resume your session, enter your Session ID above. To start a new session, leave the Session ID blank and click 'Start Session'."}
          ></textarea>

          <input
            type="text"
            className={styles.chatBox}
            placeholder={activeSessionId ? "Write your message here" : "Start a new Session First"}
            onChange={(e) => setUserMessageToChat(e.target.value)}
            value={userMessageToChat}
            disabled={isLoading || !activeSessionId}
          />

          <button
            className={styles.submitButton}
            type="submit"
            disabled={isLoading || !activeSessionId || !userMessageToChat.trim()}
          >
            {isLoading ? "Sending..." : "Submit Response"}
          </button>
        </form>
        <p className={styles.currentID}>Session ID: {activeSessionId || "No Session"}</p>
        <button
          className={styles.sessionIdSubmitButton}
          type="button"
          onClick={submitSessionId}
          disabled={isLoading || activeSessionId}
        >
          Start Session
        </button>
      </div>
    </div>
  );
}