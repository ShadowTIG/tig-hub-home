
import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, query, deleteDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { APPS } from '../constants';
import { AppItem, User } from '../types';

const Dashboard: React.FC<{ isDarkMode: boolean; user: User }> = ({ isDarkMode, user }) => {
  const [customApps, setCustomApps] = useState<AppItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'custom_apps'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const apps = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AppItem));
      setCustomApps(apps);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'custom_apps'));

    return () => unsubscribe();
  }, []);

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as any;
    
    try {
      const newAppData = {
        name: form.appName.value,
        description: form.appDesc.value,
        url: form.appUrl.value,
        icon: 'fa-globe',
        category: 'External Site',
        color: 'bg-indigo-600',
        developer: user.name,
        developerUid: user.uid
      };

      await addDoc(collection(db, 'custom_apps'), newAppData);
      setIsModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'custom_apps');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Gỡ bỏ trang web này khỏi bộ sưu tập của bạn?')) {
      try {
        await deleteDoc(doc(db, 'custom_apps', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `custom_apps/${id}`);
      }
    }
  };

  const handleLaunch = (url: string) => {
    if (url.startsWith('/')) {
      window.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const allApps = [...customApps, ...APPS];
  const filteredApps = allApps.filter(app => 
    app.name.toLowerCase().includes(search.toLowerCase()) || 
    (app.developer || '').toLowerCase().includes(search.toLowerCase())
  );

  // Group apps by category
  const groupedApps = filteredApps.reduce((acc, app) => {
    const cat = app.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(app);
    return acc;
  }, {} as Record<string, AppItem[]>);

  // Sort categories to prioritize Roblox, GTD, EHW
  const sortedCategories = Object.keys(groupedApps).sort((a, b) => {
    const priority = ['Roblox', 'Gold Tower Defense', 'EHW'];
    const idxA = priority.indexOf(a);
    const idxB = priority.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className={`flex flex-col md:flex-row md:items-end justify-between gap-8 border-b pb-12 ${isDarkMode ? 'border-white/5' : 'border-gray-100'}`}>
        <div className="space-y-4">
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] ${isDarkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-black text-white'}`}>
            <i className="fa-solid fa-microchip"></i> HUB COMMAND CENTER • v4.0
          </div>
          <h1 className={`text-6xl font-black tracking-tighter ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>MY APPS</h1>
          <p className="text-gray-500 max-w-lg font-medium">Hệ sinh thái ứng dụng cá nhân của bạn, được phân loại thông minh theo các chủ đề chính.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"></i>
            <input 
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Tìm kiếm ứng dụng..."
              className={`pl-12 pr-6 py-4 rounded-2xl outline-none border transition-all font-bold text-sm w-full sm:w-80 ${isDarkMode ? 'bg-white/5 border-white/10 text-white focus:border-indigo-500' : 'bg-gray-100 border-gray-200 focus:border-black'}`}
            />
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:-translate-y-1 transition-all active:scale-95"
          >
            Add New Website
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredApps.map((app) => (
          <div 
            key={app.id} 
            className={`group p-8 rounded-[2.5rem] border transition-all hover:-translate-y-2 relative overflow-hidden flex flex-col ${
              isDarkMode ? 'bg-[#0a0a0a] border-white/5 hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/10' : 'bg-white border-gray-100 hover:border-black hover:shadow-2xl shadow-lg shadow-gray-200/50'
            }`}
          >
            <div className={`${app.color} w-16 h-16 rounded-[2rem] flex items-center justify-center text-white text-2xl mb-8 shadow-xl group-hover:scale-110 transition-transform relative z-10`}>
              <i className={`fa-solid ${app.icon}`}></i>
            </div>
            
            <div className="space-y-2 mb-8 relative z-10 flex-1">
              <h3 className={`text-2xl font-black uppercase tracking-tighter leading-none ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{app.name}</h3>
              <p className="text-xs text-gray-500 font-medium leading-relaxed">{app.description}</p>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-white/5 relative z-10">
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">Core Section</span>
                <span className={`text-[11px] font-black uppercase tracking-tighter ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>TIG HUB</span>
              </div>
              <button 
                onClick={() => handleLaunch(app.url)}
                className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  isDarkMode ? 'bg-white/5 text-white hover:bg-indigo-600 shadow-lg' : 'bg-black text-white hover:bg-indigo-600 shadow-xl'
                }`}
              >
                Access Part
              </button>
            </div>
            
            <div className={`absolute -bottom-10 -right-10 w-32 h-32 rounded-full ${app.color} opacity-[0.03] group-hover:scale-150 transition-transform duration-700`}></div>
          </div>
        ))}
      </div>

      {filteredApps.length === 0 && (
        <div className="py-20 text-center opacity-30">
          <i className="fa-solid fa-ghost text-6xl mb-4"></i>
          <p className="text-sm font-black uppercase tracking-widest">No Applications Found</p>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
           <div className={`w-full max-w-lg rounded-[3rem] border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 ${isDarkMode ? 'bg-[#0a0a0a] border-white/10' : 'bg-white border-gray-200'}`}>
              <div className="p-10 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h2 className={`text-2xl font-black uppercase tracking-tighter ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Add New Site</h2>
                  <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">Direct External Integration</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:bg-rose-500 hover:text-white transition-all">
                  <i className="fa-solid fa-xmark text-lg"></i>
                </button>
              </div>
              <form onSubmit={handleDeploy} className="p-10 space-y-6">
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">App Display Name</label>
                    <input name="appName" required className={`w-full px-6 py-4 rounded-2xl outline-none border transition-all font-bold ${isDarkMode ? 'bg-white/5 border-white/10 text-white focus:border-indigo-500' : 'bg-gray-50 border-gray-200 focus:border-black'}`} placeholder="Ví dụ: Portfolio của tôi" />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Target Website URL</label>
                    <input name="appUrl" type="url" required className={`w-full px-6 py-4 rounded-2xl outline-none border transition-all font-bold ${isDarkMode ? 'bg-white/5 border-white/10 text-white focus:border-indigo-500' : 'bg-gray-50 border-gray-200 focus:border-black'}`} placeholder="https://myapp.com" />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Short Description</label>
                    <textarea name="appDesc" required className={`w-full px-6 py-4 rounded-2xl outline-none border transition-all font-bold resize-none ${isDarkMode ? 'bg-white/5 border-white/10 text-white focus:border-indigo-500' : 'bg-gray-50 border-gray-200 focus:border-black'}`} rows={2} placeholder="Mô tả ngắn gọn về ứng dụng này..." />
                 </div>
                 
                 <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex items-center gap-3">
                    <i className="fa-solid fa-shield-halved text-indigo-500"></i>
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Website will be registered under: {user.name}</p>
                 </div>

                 <button type="submit" className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-[0.3em] shadow-xl hover:-translate-y-1 transition-all">
                    Register Application
                 </button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
