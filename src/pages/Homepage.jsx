import React, { useEffect, useState, useRef } from "react";
import styles from './Homepage.module.css'
import axios from 'axios';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import turnersHeader from '../assets/turners-header.png';
import turnersFooter from '../assets/turners-footer.png';

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
  const chatInputRef = useRef(null);

  const backendUrl = 'http://localhost:5000'; // Ensure this matches your backend's port

  // To scroll chat to current message
  useEffect(() => {
    if (scrollChatToCurrent.current) {
      scrollChatToCurrent.current.scrollTop = scrollChatToCurrent.current.scrollHeight;
    }

    if (!isLoading && activeSessionId && chatInputRef.current) {
      chatInputRef.current.focus();
    }
  }, [sessionChat, isLoading, activeSessionId]);

  //Original function to format chat, changed for react-markdown package
  // Formats chat for display
  // const formatChatForDisplay = () => {
  //   return sessionChat.map(entry => {
  //     const speaker = entry.role === 'user' ? 'You' : 'Tina';
  //     return `${speaker}: ${entry.parts[0].text}`;
  //   }).join('\n\n');
  // }

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

      const { sessionId: receivedSessionId, conversationHistory: loadedHistory} = response.data;

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
        
        // Initial message to trigger the AI's first response, will have to filter out for display on front-end
        const initialUserPrompt = { role: "user", parts: [{ text: "start_conversation" }] };

        try {
          // Send the request to the /chat endpoint
          // Includes the received session ID and the full conversation (current history + new prompt)
          const chatResponse = await axios.post(`${backendUrl}/chat`, {
            sessionId: receivedSessionId,
            contents: [...currentChatHistory, initialUserPrompt], // Combines existing history with the new prompt
          });

          // Updating the frontend chat state with the full conversation history returned from the chat endpoint
          let returnedConversationHistoryFromChat = chatResponse.data.conversationHistory;

          // Filtering out starting message so wont display in chat
          if (returnedConversationHistoryFromChat.length > 0 &&
              returnedConversationHistoryFromChat[0].role === 'user' &&
              returnedConversationHistoryFromChat[0].parts &&
              returnedConversationHistoryFromChat[0].parts[0] &&
              returnedConversationHistoryFromChat[0].parts[0].text === "start_conversation") {
              
              returnedConversationHistoryFromChat = returnedConversationHistoryFromChat.slice(1);
          }

          // Updating the frontend chat state with the FILTERED conversation history
          setSessionChat(returnedConversationHistoryFromChat);

        } catch (chatErr) {
          console.error("Error sending initial chat message:", chatErr);
          // Handle errors if the initial chat message exchange fails
          const chatErrorMessage = 'Failed to get initial AI greeting. Please type a message to start.';
          setError(chatErrorMessage);
          alert(chatErrorMessage);
         
        }
      }

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

      // Filtering again to remove "start_conversation" 
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
      
      if(chatInputRef.current) {
      chatInputRef.current.focus();
      };
    }
  };


  return (
    <>
      <header>
        <img src={turnersHeader} alt="Turners Header" />
      </header>

      <main className={styles.main}>
        <div className={styles.outsideAiContainer}>
          
          <div className={styles.welcomeText}>
            <h1>Car Insurance Policies: Chat with Tina</h1>
            <p>Interested in some advice on what type of car insurance policy best suits you? Chat with Tina to find out, click "start session", or copy in your current Session ID and click "start session" to continue a previous conversation.</p>
          </div>
          
          
          <div className={styles.sessionContainer}>
            
            <input
              type="text"
              className={styles.userSessionIdInput}
              placeholder="Previous Session ID (optional)"
              onChange={(e) => setSessionIdInput(e.target.value)}
              disabled={isLoading || activeSessionId}
              value={sessionIdInput}
            />

            <button
              className={styles.sessionIdSubmitButton}
              type="button"
              onClick={submitSessionId}
              disabled={isLoading || activeSessionId}
              >
              Start Session
            </button>
          
            <p className={styles.currentID}> Session ID: {activeSessionId || "No   Session"}
            </p>

          </div>
          
          <div className={styles.interviewWrapper}>
            <form onSubmit={handleSubmit}>
              {/* jobTitle input and state removed */}

              

              {/* old way to render chat - for reference */}
              {/* <textarea
                ref={scrollChatToCurrent}
                name="mainChatContainer"
                className={styles.mainChatContainer}
                value={formatChatForDisplay()}
                readOnly
                rows={15}
                cols={60}
                placeholder={activeSessionId ? "Type your message below..." : "To resume your session, enter your Session ID above. To start a new session, leave the Session ID blank and click 'Start Session'."}
              ></textarea> */}
              
              {/* final way to render chat using react-markdown*/}
              <div
                  ref={scrollChatToCurrent}
                  name="mainChatContainer"
                  className={styles.mainChatContainer}
                >

                {sessionChat.map((entry, index) => (
                <div key={index} className={entry.role === 'user' ? styles.     userMessage : styles.advisorMessage}>
                  <strong>{entry.role === 'user' ? 'You:' : 'Tina:'}</strong>
                    {/* Use Markdown component for AI (model) responses */}
                    {entry.role === 'model' ? (
                      <Markdown remarkPlugins={[remarkGfm]}>{entry.parts[0].text}</Markdown>
                    ) : (
                      // For user messages, renders text in a paragraph
                  <p>{entry.parts[0].text}</p> 
                    )}
                </div>
                ))}

                {/* Placeholder text for when no session is active */}
                {!activeSessionId && (
                  <p className={styles.chatPlaceholder}>
                    To resume your session, enter your Session ID above. To start a new session, leave the Session ID blank and click 'Start Session'.
                  </p>
                )}

              </div>
              
              <input
                type="text"
                className={styles.chatBox}
                placeholder={activeSessionId ? "Write your message here" : "Start a new Session First"}
                onChange={(e) => setUserMessageToChat(e.target.value)}
                value={userMessageToChat}
                disabled={isLoading || !activeSessionId}
                ref={chatInputRef}
              />

              <button
                className={styles.submitButton}
                type="submit"
                disabled={isLoading || !activeSessionId || !userMessageToChat.trim()}
              >
                {isLoading ? "Sending..." : "Submit Response"}
              </button>
            </form>
            
            
          </div>
        </div>
      </main>

      <footer>
        <img src={turnersFooter} alt="Turners Footer" />
      </footer>
    </>
  );
}