
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, addDoc, onSnapshot, query, where, orderBy, deleteDoc, doc, updateDoc, serverTimestamp, getDocs, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { User, CommunityPost, CommunityGroup, DirectMessage, CommunityComment, Survey, SurveyOption, FileAttachment, Notification } from '../types';

const Community: React.FC<{ isDarkMode: boolean; user: User }> = ({ isDarkMode, user }) => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'roblox' | 'gtd' | 'ehw' | 'feedback' | 'mailbox' | 'people' | 'messages'>('roblox');

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['roblox', 'gtd', 'ehw', 'feedback', 'mailbox', 'people', 'messages'].includes(tabParam)) {
      setActiveTab(tabParam as any);
    }
  }, [searchParams]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [friends, setFriends] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  
  const [feedbackSearch, setFeedbackSearch] = useState('');

  const [newPostContent, setNewPostContent] = useState('');
  const [attachedFile, setAttachedFile] = useState<FileAttachment | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [isSurveyMode, setIsSurveyMode] = useState(false);
  const [surveyQuestion, setSurveyQuestion] = useState('');
  const [surveyOptions, setSurveyOptions] = useState<string[]>(['', '']);

  useEffect(() => {
    // Sync Posts
    const postsQuery = query(collection(db, 'posts'), orderBy('timestamp', 'desc'));
    const unsubscribePosts = onSnapshot(postsQuery, (snapshot) => {
      const syncedPosts = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CommunityPost));
      setPosts(syncedPosts);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'posts'));

    // Sync Notifications
    const notificationsQuery = query(
      collection(db, 'notifications'), 
      where('receiver', 'in', ['all', user.username]),
      orderBy('timestamp', 'desc')
    );
    const unsubscribeNotifs = onSnapshot(notificationsQuery, (snapshot) => {
      const syncedNotifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
      setNotifications(syncedNotifs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'notifications'));

    // Sync Messages (Sender or Receiver)
    // Using filtered snapshot since Firestore OR is complex in simple queries
    const messagesQuery = query(collection(db, 'direct_messages'), orderBy('timestamp', 'asc'));
    const unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
      const allMsgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DirectMessage));
      const filtered = allMsgs.filter(m => m.sender === user.uid || m.receiver === user.uid || m.sender === user.username || m.receiver === user.username);
      setMessages(filtered);
    });

    // Sync Users for People tab
    const usersQuery = query(collection(db, 'users'), limit(50));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const allUsers = snapshot.docs.map(d => d.data() as User);
      setUsers(allUsers);
    });

    const savedFriends = localStorage.getItem(`tig_friends_${user.username}`);
    if (savedFriends) setFriends(JSON.parse(savedFriends));

    return () => {
      unsubscribePosts();
      unsubscribeNotifs();
      unsubscribeMessages();
      unsubscribeUsers();
    };
  }, [user.username, user.uid]);

  useEffect(() => {
    localStorage.setItem(`tig_friends_${user.username}`, JSON.stringify(friends));
  }, [friends, user.username]);

  const handleGenericFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024 * 1024) {
      alert("Dung lượng file vượt quá giới hạn 1GB.");
      return;
    }

    setIsUploadingFile(true);
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5 + Math.random() * 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        
        const reader = new FileReader();
        reader.onloadend = () => {
          setAttachedFile({
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            url: reader.result as string
          });
          setIsUploadingFile(false);
          setUploadProgress(0);
        };
        // For files up to 1GB, we simulate storage by reading a slice if it's too big, 
        // but for UI purposes we'll handle smaller ones normally.
        if (file.size < 20 * 1024 * 1024) { 
           reader.readAsDataURL(file);
        } else {
           // Large file simulation (we don't store actual data to avoid crashing browser)
           setAttachedFile({
             name: file.name,
             size: file.size,
             type: file.type || 'application/octet-stream',
             url: '#' 
           });
           setIsUploadingFile(false);
           setUploadProgress(0);
        }
      }
      setUploadProgress(progress);
    }, 100);
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent && !attachedFile && !isSurveyMode) return;

    try {
      const postData = {
        author: user.name,
        authorUsername: user.username,
        content: newPostContent,
        fileInfo: attachedFile || null,
        mediaUrl: attachedFile?.url || null,
        mediaType: attachedFile ? (attachedFile.type.startsWith('image') ? 'image' : (attachedFile.type.startsWith('audio') ? 'audio' : 'file')) : null,
        likes: 0,
        comments: [],
        timestamp: new Date().toISOString(),
        groupId: activeTab
      };

      await addDoc(collection(db, 'posts'), postData);
      
      if (activeTab === 'feedback') {
        const adminNotif = {
          sender: user.username,
          receiver: 'admin',
          content: `Phản hồi mới từ @${user.username}: ${newPostContent.substring(0, 50)}...`,
          timestamp: new Date().toISOString(),
          type: 'feedback',
          read: false
        };
        await addDoc(collection(db, 'notifications'), adminNotif);
      }
      
      setNewPostContent('');
      setAttachedFile(null);
      setIsSurveyMode(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'posts');
    }
  };

  const handleVote = (postId: string, optionId: string) => {
    const updatedPosts = posts.map(post => {
      if (post.id === postId && post.survey) {
        const hasVoted = post.survey.options.some(opt => opt.voters.includes(user.username));
        if (hasVoted) return post;
        const updatedOptions = post.survey.options.map(opt => opt.id === optionId ? { ...opt, votes: opt.votes + 1, voters: [...opt.voters, user.username] } : opt);
        return { ...post, survey: { ...post.survey, options: updatedOptions, totalVotes: post.survey.totalVotes + 1 } };
      }
      return post;
    });
    setPosts(updatedPosts);
  };

  const renderFileAttachment = (file: FileAttachment) => (
    <div className={`mt-4 p-4 rounded-2xl border flex items-center gap-4 ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-gray-50 border-gray-100'}`}>
      <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0">
        <i className={`fa-solid ${file.type.startsWith('image') ? 'fa-image' : file.type.startsWith('video') ? 'fa-video' : 'fa-file-lines'}`}></i>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black truncate uppercase tracking-widest">{file.name}</p>
        <p className="text-[10px] text-gray-500 font-bold">{Math.round(file.size / 1024 / 1024 * 10) / 10} MB • {file.type || 'Unknown Type'}</p>
      </div>
      <a href={file.url === '#' ? undefined : file.url} download={file.name} className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-all">
        <i className="fa-solid fa-download text-sm"></i>
      </a>
    </div>
  );

  const handleDeletePost = async (postId: string) => {
    try {
      await deleteDoc(doc(db, 'posts', postId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `posts/${postId}`);
    }
  };

  const handleEditPost = async (post: CommunityPost) => {
    const newContent = prompt('Thay đổi nội dung bài viết:', post.content);
    if (newContent !== null) {
      try {
        await updateDoc(doc(db, 'posts', post.id), { content: newContent });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `posts/${post.id}`);
      }
    }
  };

  const handleBanUser = async (targetUsername: string) => {
    if (confirm(`Bạn có chắc chắn muốn KHÓA TÀI KHOẢN @${targetUsername}?`)) {
      try {
        const userQuery = query(collection(db, 'users'), where('username', '==', targetUsername));
        const userSnapshot = await getDocs(userQuery);
        if (!userSnapshot.empty) {
          const targetUserDoc = userSnapshot.docs[0];
          await updateDoc(doc(db, 'users', targetUserDoc.id), { isBanned: true });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'users');
      }
    }
  };

  const handleBroadcastSystemNotif = async () => {
    const msg = prompt('Nhập thông báo gửi đến toàn thể người dùng:');
    if (msg) {
      try {
        await addDoc(collection(db, 'notifications'), {
          sender: user.username,
          receiver: 'all',
          content: msg,
          timestamp: new Date().toISOString(),
          type: 'system',
          read: false
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'notifications');
      }
    }
  };

  const renderCreatePostArea = () => (
    <div className={`p-6 rounded-[2.5rem] border ${isDarkMode ? 'bg-[#0a0a0a] border-white/5' : 'bg-white border-gray-200 shadow-xl'}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-500">
          {activeTab === 'feedback' ? 'Gửi góp ý cho nhà phát triển' : `Đăng bài vào Blog ${activeTab.toUpperCase()}`}
        </h3>
        {activeTab === 'feedback' && (
          <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-500 text-[8px] font-bold uppercase tracking-widest">Trực tiếp cho Dev</span>
        )}
      </div>
      <form onSubmit={handleCreatePost} className="space-y-4">
        <div className="flex gap-4">
          <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-indigo-500 shrink-0" alt="" />
          <div className="flex-1">
            <textarea
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              placeholder={`Bạn đang nghĩ gì, ${user.name}? (Đính kèm file lên đến 1GB)`}
              className={`w-full bg-transparent border-none focus:ring-0 text-lg font-medium resize-none py-2 ${isDarkMode ? 'placeholder:text-white/10 text-white' : 'placeholder:text-gray-300 text-gray-900'}`}
              rows={2}
            />
          </div>
        </div>

        {isUploadingFile && (
           <div className="space-y-2 px-4">
              <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-indigo-400">
                <span>Uploading to Hub Server...</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 transition-all" style={{width: `${uploadProgress}%`}}></div>
              </div>
           </div>
        )}

        {attachedFile && renderFileAttachment(attachedFile)}

        <div className={`pt-4 border-t flex items-center justify-between ${isDarkMode ? 'border-white/5' : 'border-gray-100'}`}>
          <div className="flex gap-2">
             <label className={`w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all ${isDarkMode ? 'bg-white/5 text-gray-400 hover:text-white' : 'bg-gray-100 text-gray-500 hover:bg-black hover:text-white'}`}>
                <i className="fa-solid fa-paperclip text-sm"></i>
                <input type="file" className="hidden" onChange={handleGenericFileUpload} />
             </label>
             <button type="button" onClick={() => setIsSurveyMode(!isSurveyMode)} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isSurveyMode ? 'bg-indigo-600 text-white' : (isDarkMode ? 'bg-white/5 text-gray-400' : 'bg-gray-100')}`}>
                <i className="fa-solid fa-square-poll-vertical text-sm"></i>
             </button>
          </div>
          <button type="submit" disabled={isUploadingFile} className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95 disabled:opacity-50">
            Broadcast Post
          </button>
        </div>
      </form>
    </div>
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [chatMessage, setChatMessage] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedUser]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage || !selectedUser) return;

    try {
      const newMessage = {
        sender: user.uid,
        senderUsername: user.username,
        receiver: selectedUser.uid,
        receiverUsername: selectedUser.username,
        content: chatMessage,
        timestamp: new Date().toISOString(),
        read: false
      };

      await addDoc(collection(db, 'direct_messages'), newMessage);
      setChatMessage('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'direct_messages');
    }
  };

  const handleAddFriend = (username: string) => {
    if (friends.includes(username)) return;
    setFriends([...friends, username]);
  };

  const renderPeople = () => {
    const filteredUsers = users.filter(u => 
      u.username !== user.username && 
      (u.username.toLowerCase().includes(searchQuery.toLowerCase()) || 
       u.name.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
      <div className="space-y-6">
        <div className={`p-6 rounded-[2rem] border ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-white border-gray-100 shadow-xl'}`}>
          <div className="relative">
            <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"></i>
            <input 
              type="text" 
              placeholder="Tìm kiếm bạn bè theo tên hoặc username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-12 pr-4 py-4 rounded-2xl border text-sm font-bold ${isDarkMode ? 'bg-black border-white/10 text-white' : 'bg-gray-50 border-gray-200'}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredUsers.length === 0 ? (
            <div className="col-span-full py-20 text-center opacity-30 uppercase text-[10px] font-black tracking-widest">
              Không tìm thấy ai phù hợp
            </div>
          ) : (
            filteredUsers.map(u => (
              <div key={u.username} className={`p-6 rounded-3xl border flex items-center gap-4 ${isDarkMode ? 'bg-black border-white/5' : 'bg-white border-gray-100 shadow-md'}`}>
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`} className="w-14 h-14 rounded-2xl bg-gray-100" alt="" />
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-black uppercase tracking-widest truncate">{u.name}</h4>
                  <p className="text-[10px] font-bold text-gray-500">@{u.username}</p>
                </div>
                <div className="flex gap-2">
                  {friends.includes(u.username) ? (
                    <button 
                      onClick={() => { setSelectedUser(u); setActiveTab('messages'); }}
                      className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center transition-all hover:scale-105"
                    >
                      <i className="fa-solid fa-comment"></i>
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleAddFriend(u.username)}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-105 ${isDarkMode ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'}`}
                    >
                      <i className="fa-solid fa-user-plus"></i>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderMessages = () => {
    const myFriends = users.filter(u => friends.includes(u.username));
    const currentChatMessages = messages.filter(m => 
      (m.sender === user.uid && m.receiver === selectedUser?.uid) ||
      (m.sender === selectedUser?.uid && m.receiver === user.uid) ||
      (m.sender === user.username && m.receiver === selectedUser?.username) ||
      (m.sender === selectedUser?.username && m.receiver === user.username)
    );

    return (
      <div className="flex flex-col lg:flex-row gap-6 h-[600px]">
        {/* Friends List for Messaging */}
        <div className={`w-full lg:w-64 flex flex-col gap-2 overflow-y-auto pr-2 ${isDarkMode ? 'border-white/5' : 'border-gray-100'}`}>
          <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest px-2 mb-2">My Friends</p>
          {myFriends.length === 0 ? (
            <div className="text-[8px] font-bold text-gray-500 uppercase tracking-widest text-center py-10 px-4 bg-white/5 rounded-2xl italic">
              Vào mục People để thêm bạn bè
            </div>
          ) : (
            myFriends.map(f => (
              <button 
                key={f.username}
                onClick={() => setSelectedUser(f)}
                className={`flex items-center gap-3 p-3 rounded-2xl transition-all ${selectedUser?.username === f.username ? (isDarkMode ? 'bg-indigo-600 text-white' : 'bg-black text-white') : (isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50')}`}
              >
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${f.username}`} className="w-10 h-10 rounded-xl" alt="" />
                <div className="text-left min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest truncate">{f.name}</p>
                  <p className="text-[8px] opacity-60">Online</p>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Chat Window */}
        <div className={`flex-1 flex flex-col rounded-[2.5rem] border ${isDarkMode ? 'bg-black border-white/5' : 'bg-white border-gray-100 shadow-2xl'}`}>
          {selectedUser ? (
            <>
              <div className="p-6 border-b border-white/5 flex items-center gap-4">
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedUser.username}`} className="w-12 h-12 rounded-2xl" alt="" />
                <div>
                  <h4 className="text-sm font-black uppercase tracking-widest">{selectedUser.name}</h4>
                  <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-emerald-500"></span> Active Now
                  </span>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {currentChatMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender === user.username ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-4 rounded-2xl text-xs font-bold leading-relaxed ${
                      msg.sender === user.username 
                        ? (isDarkMode ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-black text-white rounded-br-none') 
                        : (isDarkMode ? 'bg-white/10 text-white rounded-bl-none' : 'bg-gray-100 text-gray-900 rounded-bl-none')
                    }`}>
                      {msg.content}
                      <p className="mt-1 text-[7px] opacity-40 text-right">{new Date(msg.timestamp).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className="p-6 border-t border-white/5 flex gap-2">
                <input 
                  type="text" 
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Nhập tin nhắn..."
                  className={`flex-1 p-4 rounded-2xl border text-sm font-bold ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-200'}`}
                />
                <button type="submit" className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all">
                  <i className="fa-solid fa-paper-plane"></i>
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center p-8">
              <i className="fa-solid fa-comments text-5xl mb-4"></i>
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">Chọn một người bạn để bắt đầu trò chuyện</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderMailbox = () => {
    const myNotifs = user.role === 'admin' 
      ? notifications 
      : notifications.filter(n => n.receiver === 'all' || n.receiver === user.username);

    return (
      <div className="space-y-6">
        {user.role === 'admin' && (
          <button 
            onClick={handleBroadcastSystemNotif}
            className="w-full py-4 border-2 border-dashed border-indigo-500/30 rounded-[2rem] text-indigo-500 font-black text-[10px] uppercase tracking-[0.2em] hover:bg-indigo-500 hover:text-white transition-all shadow-xl shadow-indigo-500/10"
          >
            <i className="fa-solid fa-bullhorn mr-2"></i>
            Broadcast Global Message
          </button>
        )}

        <div className="space-y-3">
          {myNotifs.length === 0 ? (
            <div className="py-20 text-center opacity-30 italic uppercase text-[10px] font-black tracking-widest">
              Hòm thư trống
            </div>
          ) : (
            myNotifs.map(n => (
              <div key={n.id} className={`p-6 rounded-3xl border ${isDarkMode ? 'bg-white/5 border-white/5 shadow-2xl' : 'bg-white border-gray-100 shadow-xl'} flex items-start gap-4 transition-all hover:scale-[1.01]`}>
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  n.type === 'feedback' ? 'bg-amber-500/20 text-amber-500' : 'bg-indigo-500 text-white'
                }`}>
                  <i className={`fa-solid ${n.type === 'feedback' ? 'fa-message-heart' : 'fa-bullhorn'}`}></i>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">
                      {n.type === 'feedback' ? 'User Feedback' : 'System Information'}
                    </span>
                    <span className="text-[8px] font-bold text-gray-400">{new Date(n.timestamp).toLocaleString()}</span>
                  </div>
                  <p className={`text-sm font-bold leading-relaxed ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{n.content}</p>
                  <p className="mt-2 text-[8px] font-black uppercase tracking-widest text-indigo-500">FROM: {n.sender === user.username ? 'DEVELOPER' : `@${n.sender}`}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderPost = (post: CommunityPost) => (
    <div key={post.id} className={`p-8 rounded-[2.5rem] border ${isDarkMode ? 'bg-[#0a0a0a] border-white/5 shadow-2xl' : 'bg-white border-gray-100 shadow-xl'}`}>
      <div className="flex items-center gap-4 mb-6">
        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${post.authorUsername}`} className="w-12 h-12 rounded-2xl bg-gray-100" alt="" />
        <div className="flex-1">
          <h4 className={`text-sm font-black uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{post.author}</h4>
          <p className="text-[10px] font-bold text-gray-500">@{post.authorUsername} • {new Date(post.timestamp).toLocaleString()}</p>
        </div>
        
        <div className="flex items-center gap-2">
          {activeTab === 'feedback' && (
            <div className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-[8px] font-black uppercase tracking-widest border border-indigo-500/20">
              Suggestion
            </div>
          )}
          
          {user.role === 'admin' && (
            <div className="flex gap-1">
              <button onClick={() => handleEditPost(post)} className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center hover:bg-indigo-500 hover:text-white transition-all">
                <i className="fa-solid fa-pen text-[10px]"></i>
              </button>
              <button onClick={() => handleDeletePost(post.id)} className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all">
                <i className="fa-solid fa-trash text-[10px]"></i>
              </button>
              <button onClick={() => handleBanUser(post.authorUsername)} className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center hover:bg-rose-600 transition-all" title="Khóa tài khoản">
                <i className="fa-solid fa-user-slash text-[10px]"></i>
              </button>
            </div>
          )}
        </div>
      </div>
      {post.content && <p className={`text-lg leading-relaxed mb-6 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{post.content}</p>}
      {post.fileInfo && renderFileAttachment(post.fileInfo)}
      <div className={`pt-6 border-t flex items-center gap-6 mt-6 ${isDarkMode ? 'border-white/5' : 'border-gray-100'}`}>
        <button className="flex items-center gap-2 text-rose-500 font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all"><i className="fa-solid fa-heart"></i> {post.likes} Likes</button>
        <button className="flex items-center gap-2 text-gray-400 font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all"><i className="fa-solid fa-comment"></i> {post.comments.length} Comments</button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <aside className="w-full lg:w-72 space-y-4 shrink-0">
        <div className={`p-4 rounded-3xl border ${isDarkMode ? 'bg-[#0a0a0a] border-white/5' : 'bg-white border-gray-100 shadow-sm'}`}>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-4 mb-4">Content Ecosystem</p>
          <div className="space-y-1">
            {[
              { id: 'roblox', label: 'Roblox Blog', icon: 'fa-gamepad', color: 'text-red-500' },
              { id: 'gtd', label: 'GTD Blog', icon: 'fa-shield-halved', color: 'text-amber-500' },
              { id: 'ehw', label: 'EHW Blog', icon: 'fa-sword', color: 'text-emerald-500' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === tab.id
                    ? (isDarkMode ? 'bg-indigo-600 text-white shadow-lg' : 'bg-black text-white shadow-lg') 
                    : (isDarkMode ? 'text-gray-400 hover:bg-white/5' : 'text-gray-500 hover:bg-gray-50')
                }`}
              >
                <i className={`fa-solid ${tab.icon} text-sm ${activeTab === tab.id ? 'text-white' : tab.color}`}></i>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`p-4 rounded-3xl border ${isDarkMode ? 'bg-[#0a0a0a] border-white/5' : 'bg-white border-gray-100 shadow-sm'}`}>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-4 mb-4">Hub Social</p>
          <div className="space-y-1">
            {[
              { id: 'people', label: 'Find People', icon: 'fa-users', color: 'text-blue-500' },
              { id: 'messages', label: 'Uplink Messages', icon: 'fa-comment-dots', color: 'text-indigo-500' },
              { id: 'mailbox', label: 'Box Mail', icon: 'fa-mailbox', color: 'text-rose-500' },
              { id: 'feedback', label: 'Submit Feedback', icon: 'fa-message-heart', color: 'text-amber-500' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === tab.id
                    ? (isDarkMode ? 'bg-indigo-600 text-white shadow-lg' : 'bg-black text-white shadow-lg') 
                    : (isDarkMode ? 'text-gray-400 hover:bg-white/5' : 'text-gray-500 hover:bg-gray-50')
                }`}
              >
                <i className={`fa-solid ${tab.icon} text-sm ${activeTab === tab.id ? 'text-white' : tab.color}`}></i>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        
        <div className={`p-6 rounded-3xl border ${isDarkMode ? 'bg-[#0a0a0a] border-white/5' : 'bg-white border-gray-100'}`}>
          <div className="flex items-center gap-2 text-indigo-500 mb-2">
            <i className="fa-solid fa-circle-check text-xs"></i>
            <span className="text-[9px] font-black uppercase tracking-widest">Community Rules</span>
          </div>
          <p className="text-[10px] text-gray-500 font-bold leading-relaxed uppercase">
            VUI LÒNG KHÔNG SPAM VÀO CÁC BLOG CHÍNH. MỌI GÓP Ý TRÂN TRỌNG SẼ ĐƯỢC NHÀ PHÁT TRIỂN TIẾP NHẬN TRỰC TIẾP.
          </p>
        </div>
      </aside>

      <div className="flex-1 space-y-6">
        <div className={`p-8 rounded-[2.5rem] border ${isDarkMode ? 'bg-indigo-500/5 border-indigo-500/10' : 'bg-indigo-50 border-indigo-100'}`}>
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-xl shadow-lg">
                <i className={`fa-solid ${
                  activeTab === 'roblox' ? 'fa-gamepad' : 
                  activeTab === 'gtd' ? 'fa-shield-halved' : 
                  activeTab === 'ehw' ? 'fa-sword' : 
                  activeTab === 'mailbox' ? 'fa-mailbox' : 
                  activeTab === 'people' ? 'fa-users' :
                  activeTab === 'messages' ? 'fa-comment-dots' : 'fa-message-heart'
                }`}></i>
             </div>
             <div>
               <h2 className="text-xl font-black uppercase tracking-tighter">
                 {activeTab === 'roblox' ? 'Roblox Feed' : 
                  activeTab === 'gtd' ? 'Gold Tower Defense Feed' : 
                  activeTab === 'ehw' ? 'EHW Game Center' : 
                  activeTab === 'mailbox' ? 'Mailbox Center' : 
                  activeTab === 'people' ? 'The Community People' :
                  activeTab === 'messages' ? 'Direct Uplink' : 'Developer Feedback Hub'}
               </h2>
               <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                 {activeTab === 'feedback' ? 'Gửi ý kiến của bạn để giúp chúng tôi hoàn thiện Hub tốt hơn' : 
                  activeTab === 'mailbox' ? 'Nhận thông tin và cập nhật quan trọng từ Nhà phát triển' : 
                  activeTab === 'people' ? 'Tìm kiếm và kết nối với những người dùng khác trong hệ thống' :
                  activeTab === 'messages' ? 'Trò chuyện trực tiếp với bạn bè của bạn' : 'Tổng hợp các bài viết và thảo luận mới nhất'}
               </p>
             </div>
          </div>
        </div>

        {activeTab !== 'mailbox' && activeTab !== 'people' && activeTab !== 'messages' && renderCreatePostArea()}
        
        <div className="space-y-6">
          {activeTab === 'mailbox' ? renderMailbox() : 
           activeTab === 'people' ? renderPeople() :
           activeTab === 'messages' ? renderMessages() : (
            posts.filter(p => p.groupId === activeTab).length === 0 ? (
              <div className={`py-32 text-center rounded-[2.5rem] border border-dashed ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
                <i className="fa-solid fa-folder-open text-4xl text-gray-400 mb-4 block"></i>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Chưa có bài viết nào trong mục này</p>
              </div>
            ) : (
              posts.filter(p => p.groupId === activeTab).map(post => renderPost(post))
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default Community;
