import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { 
  Shield, Users, CreditCard, DollarSign, Search, CheckCircle2, 
  PauseCircle, PlayCircle, Clock, RefreshCw, UserCheck, ShieldAlert, 
  Activity, Sparkles, Ban
} from 'lucide-react';

const formatRs = (num) => '₹' + Math.round((num || 0)).toLocaleString('en-IN');

export default function AdminDashboard() {
  const { user } = useAuth();
  const { showAlert, showConfirm } = useModal();
  const [usersList, setUsersList] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [grantPlanType, setGrantPlanType] = useState('monthly');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [metrics, setMetrics] = useState({
    totalUsers: 0,
    activePaidSubs: 0,
    totalRevenue: 0,
    monthlySubs: 0,
    yearlySubs: 0,
  });

  const fetchAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data: profiles },
        { data: subscriptions },
        { data: activityLogs }
      ] = await Promise.all([
        supabase.from('user_profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('user_subscriptions').select('*'),
        supabase.from('admin_activity_logs').select('*').order('created_at', { ascending: false }).limit(50)
      ]);

      const subMap = {};
      let totalRev = 0;
      let activePaidCount = 0;
      let mCount = 0;
      let yCount = 0;

      subscriptions?.forEach(sub => {
        subMap[sub.user_id] = sub;
        totalRev += parseFloat(sub.amount_paid || 0);
        const isActive = sub.status === 'active' && new Date(sub.current_period_end) > new Date();
        if (isActive) {
          activePaidCount++;
          if (sub.plan_type === 'monthly') mCount++;
          if (sub.plan_type === 'yearly') yCount++;
        }
      });

      const mergedUsers = (profiles || []).map(p => ({
        ...p,
        subscription: subMap[p.id] || null,
      }));

      setUsersList(mergedUsers);
      setLogs(activityLogs || []);
      setMetrics({
        totalUsers: profiles?.length || 0,
        activePaidSubs: activePaidCount,
        totalRevenue: totalRev,
        monthlySubs: mCount,
        yearlySubs: yCount
      });
    } catch (err) {
      console.error("Admin fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const executeFetch = async () => {
      await Promise.resolve();
      if (isMounted) {
        fetchAdminData();
      }
    };
    executeFetch();
    return () => {
      isMounted = false;
    };
  }, [fetchAdminData]);

  const logAdminAction = async (action, targetUser, details) => {
    try {
      await supabase.from('admin_activity_logs').insert([{
        admin_id: user.id,
        admin_email: user.email,
        action,
        target_user_id: targetUser.id,
        target_user_email: targetUser.email,
        details
      }]);
    } catch (e) {
      console.error("Audit log failed:", e);
    }
  };

  const handleToggleServicePause = (targetUser) => {
    const isCurrentlyActive = targetUser.is_active;
    const newStatus = !isCurrentlyActive;
    
    showConfirm({
      title: isCurrentlyActive ? "Pause Services?" : "Resume Services?",
      message: isCurrentlyActive 
        ? `Are you sure you want to pause all store services for ${targetUser.email}? Access will be blocked immediately.` 
        : `Resume active platform services for ${targetUser.email}?`,
      isDanger: isCurrentlyActive,
      confirmText: isCurrentlyActive ? "Pause Services" : "Resume Services",
      onConfirm: async () => {
        const { error } = await supabase
          .from('user_profiles')
          .update({ is_active: newStatus, updated_at: new Date().toISOString() })
          .eq('id', targetUser.id);

        if (!error) {
          await logAdminAction(newStatus ? 'SERVICES_RESUMED' : 'SERVICES_PAUSED', targetUser, { newStatus });
          fetchAdminData();
          showAlert({
            title: newStatus ? "Services Resumed" : "Services Paused",
            message: `Account status updated for ${targetUser.email}.`,
            type: newStatus ? "success" : "warning"
          });
        } else {
          showAlert({ title: "Error", message: error.message, type: "error" });
        }
      }
    });
  };

  const handleRevokeSubscription = (targetUser) => {
    showConfirm({
      title: "Revoke Active Membership?",
      message: `Are you sure you want to revoke the active subscription plan for ${targetUser.email}?`,
      isDanger: true,
      confirmText: "Revoke Membership",
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('user_subscriptions')
            .update({
              status: 'canceled',
              updated_at: new Date().toISOString()
            })
            .eq('user_id', targetUser.id);

          if (error) throw error;

          await logAdminAction('SUBSCRIPTION_REVOKED_BY_ADMIN', targetUser, {
            previous_plan: targetUser.subscription?.plan_type
          });

          fetchAdminData();
          showAlert({ title: "Plan Revoked", message: `Membership revoked for ${targetUser.email}.`, type: "success" });
        } catch (err) {
          showAlert({ title: "Revocation Failed", message: err.message, type: "error" });
        }
      }
    });
  };

  const openGrantModal = (targetUser) => {
    setSelectedUser(targetUser);
    setGrantPlanType(targetUser.subscription?.plan_type || 'monthly');
    setGrantModalOpen(true);
  };

  // Submit Plan Grant (1 Month for Monthly, 1 Year for Yearly)
  const handleGrantSubscriptionSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    setIsSubmitting(true);

    try {
      const startDate = new Date();
      const endDate = new Date();
      
      if (grantPlanType === 'monthly') {
        endDate.setMonth(endDate.getMonth() + 1);
      } else {
        endDate.setFullYear(endDate.getFullYear() + 1);
      }

      const payload = {
        user_id: selectedUser.id,
        plan_type: grantPlanType,
        status: 'active',
        current_period_start: startDate.toISOString(),
        current_period_end: endDate.toISOString(),
        amount_paid: 0,
        razorpay_payment_id: `admin_override_${Date.now()}`,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('user_subscriptions')
        .upsert([payload], { onConflict: 'user_id' });

      if (error) throw error;

      await logAdminAction('SUBSCRIPTION_GRANTED_BY_ADMIN', selectedUser, {
        plan_type: grantPlanType,
        valid_until: endDate.toISOString()
      });

      setGrantModalOpen(false);
      fetchAdminData();
      showAlert({
        title: "Access Granted",
        message: `${grantPlanType === 'monthly' ? 'Monthly Pro Plan (1 Month)' : 'Annual Enterprise Plan (1 Year)'} granted to ${selectedUser.email}.`,
        type: "success"
      });
    } catch (err) {
      showAlert({ title: "Grant Failed", message: err.message, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredUsers = usersList.filter(u => 
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-12 transition-colors duration-300">
      
      {/* Admin Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 transform translate-x-10 -translate-y-10 pointer-events-none">
          <Shield size={220} className="text-blue-500" />
        </div>
        
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 text-xs font-black uppercase tracking-widest mb-3">
            <ShieldAlert size={14} /> Super Admin Control Center
          </div>
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight">System Administration</h2>
          <p className="text-slate-400 text-sm mt-1">Manage store accounts, grant/revoke memberships, pause services, and review security logs.</p>
        </div>

        <button
          type="button"
          onClick={fetchAdminData}
          disabled={loading}
          className="relative z-10 px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl text-xs font-bold transition-all border border-slate-700 flex items-center gap-2 w-fit cursor-pointer shadow-md"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin text-blue-400' : 'text-blue-400'} />
          Refresh Cloud State
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total Registered Users</p>
              <h3 className="text-3xl font-black text-slate-800 dark:text-slate-100">{metrics.totalUsers}</h3>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
              <Users size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Active Subscriptions</p>
              <h3 className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{metrics.activePaidSubs}</h3>
              <p className="text-[11px] text-slate-400 mt-1 font-semibold">Monthly: {metrics.monthlySubs} • Annual: {metrics.yearlySubs}</p>
            </div>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <CreditCard size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total Platform Revenue</p>
              <h3 className="text-3xl font-black text-indigo-600 dark:text-indigo-400">{formatRs(metrics.totalRevenue)}</h3>
            </div>
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <DollarSign size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Audit Logs Recorded</p>
              <h3 className="text-3xl font-black text-amber-500">{logs.length}</h3>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-500 rounded-xl">
              <Activity size={24} />
            </div>
          </div>
        </div>

      </div>

      {/* Main Section: User & Membership Management */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-50/50 dark:bg-slate-900/50">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <UserCheck size={20} className="text-blue-500" /> Stores & User Accounts
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Control memberships, pause/resume services, and track status.</p>
          </div>

          <div className="relative w-full sm:w-72">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Search by store email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none text-slate-800 dark:text-slate-200"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-400 font-semibold uppercase text-[11px] tracking-wider border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="px-6 py-4">Account Email</th>
                <th className="px-6 py-4 text-center">Account Role</th>
                <th className="px-6 py-4 text-center">Service Status</th>
                <th className="px-6 py-4">Subscription Plan</th>
                <th className="px-6 py-4">Valid Until</th>
                <th className="px-6 py-4 text-center">Administrative Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-slate-400">Loading platform catalog...</td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-slate-400">No matching user accounts found.</td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const sub = u.subscription;
                  const isSubActive = sub && sub.status === 'active' && new Date(sub.current_period_end) > new Date();
                  const isAdminGranted = sub?.razorpay_payment_id?.startsWith('admin_override');

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900 dark:text-white">{u.email}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">UID: {u.id.substring(0, 16)}...</div>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          u.role === 'admin' 
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-300' 
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {u.role}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-center">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 size={13} /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                            <PauseCircle size={13} /> Paused
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {isSubActive ? (
                          <div>
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold uppercase bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                              {sub.plan_type}
                            </span>
                            <span className="block text-[11px] mt-1 font-semibold text-slate-400">
                              {isAdminGranted ? (
                                <span className="text-blue-500 dark:text-blue-400 font-bold">Granted by Admin</span>
                              ) : (
                                `Paid: ₹${sub.amount_paid}`
                              )}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-500 font-semibold">No Active Plan</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {isSubActive ? (
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <Clock size={14} className="text-blue-500" />
                            {new Date(sub.current_period_end).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          
                          {/* Grant Subscription Button */}
                          <button
                            type="button"
                            onClick={() => openGrantModal(u)}
                            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-800/40 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                            title="Grant Plan"
                          >
                            <Sparkles size={13} /> Grant Plan
                          </button>

                          {/* Revoke Plan Button (Only if subscription is active) */}
                          {isSubActive && (
                            <button
                              type="button"
                              onClick={() => handleRevokeSubscription(u)}
                              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                              title="Revoke Active Plan"
                            >
                              <Ban size={13} /> Revoke
                            </button>
                          )}

                          {/* Pause / Resume Services Button */}
                          <button
                            type="button"
                            onClick={() => handleToggleServicePause(u)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                              u.is_active 
                                ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50' 
                                : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50'
                            }`}
                            title={u.is_active ? 'Pause Services' : 'Resume Services'}
                          >
                            {u.is_active ? (
                              <>
                                <PauseCircle size={13} /> Pause Services
                              </>
                            ) : (
                              <>
                                <PlayCircle size={13} /> Resume Services
                              </>
                            )}
                          </button>

                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin Activity Audit Trail Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Activity size={20} className="text-indigo-500" /> Admin Audit & Activity Logs
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Real-time immutable log of plan grants, plan revocations, and service pause/resumes.</p>
        </div>

        <div className="overflow-x-auto max-h-80 custom-scrollbar">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-white dark:bg-slate-950 text-slate-400 font-semibold uppercase text-[10px] tracking-wider sticky top-0 border-b border-slate-100 dark:border-slate-800 z-10">
              <tr>
                <th className="px-6 py-3">Timestamp</th>
                <th className="px-6 py-3">Admin</th>
                <th className="px-6 py-3">Action</th>
                <th className="px-6 py-3">Target Store Email</th>
                <th className="px-6 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-slate-400">No logs recorded yet.</td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-6 py-3 font-mono text-xs whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-6 py-3 font-semibold text-slate-800 dark:text-slate-200">{log.admin_email}</td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded font-mono text-[10px] font-bold">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-3 font-bold text-slate-700 dark:text-slate-300">{log.target_user_email || 'N/A'}</td>
                    <td className="px-6 py-3 text-xs font-mono text-slate-500 max-w-xs truncate">{JSON.stringify(log.details)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Direct Plan Selection (Months removed) */}
      {grantModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-2">
              <Sparkles className="text-blue-500" /> Grant Access Plan
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              Target Store: <strong className="text-slate-800 dark:text-slate-200">{selectedUser?.email}</strong>
            </p>

            <form onSubmit={handleGrantSubscriptionSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Select Plan to Grant</label>
                <div className="space-y-3">
                  <label 
                    onClick={() => setGrantPlanType('monthly')}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      grantPlanType === 'monthly'
                        ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-bold">Monthly Pro Plan</div>
                      <div className="text-xs text-slate-400">1 Month validity (₹1,499 value)</div>
                    </div>
                    <input 
                      type="radio" 
                      name="plan" 
                      checked={grantPlanType === 'monthly'} 
                      onChange={() => setGrantPlanType('monthly')}
                      className="w-4 h-4 text-blue-600"
                    />
                  </label>

                  <label 
                    onClick={() => setGrantPlanType('yearly')}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      grantPlanType === 'yearly'
                        ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-bold">Annual Enterprise Plan</div>
                      <div className="text-xs text-slate-400">1 Year validity (₹14,999 value)</div>
                    </div>
                    <input 
                      type="radio" 
                      name="plan" 
                      checked={grantPlanType === 'yearly'} 
                      onChange={() => setGrantPlanType('yearly')}
                      className="w-4 h-4 text-blue-600"
                    />
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setGrantModalOpen(false)}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-md cursor-pointer"
                >
                  {isSubmitting ? 'Granting...' : 'Confirm Grant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}