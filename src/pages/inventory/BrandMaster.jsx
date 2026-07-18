import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { Plus, Tag, Edit2, Trash2, X, AlertTriangle, History, Search, Wine, Layers } from 'lucide-react';

export default function BrandMaster() {
  const { user } = useAuth();
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Realtime Database sync channel
  useEffect(() => {
    const channel = supabase
      .channel('brandmaster-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brands' }, () => setRefreshTrigger(prev => prev + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brand_price_history' }, () => setRefreshTrigger(prev => prev + 1))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Form State
  const [formData, setFormData] = useState({
    brandName: '',
    category: 'Whisky',
    bottleSize: '750ml',
    sellingPrice: '',
    mrpPrice: '',
  });

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [brandToDelete, setBrandToDelete] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [priceHistory, setPriceHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Fetch Brands without synchronous state setting inside the call path
  const fetchBrands = async () => {
    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .order('display_order', { ascending: true })
      .order('brand_name', { ascending: true });
      
    if (!error) {
      const sortedBrands = (data || []).sort((a, b) => {
        const orderA = a.display_order ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.display_order ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return (a.brand_name || '').localeCompare(b.brand_name || '');
      });
      setBrands(sortedBrands);
    }
    setLoading(false);
  };

  useEffect(() => { 
    let isMounted = true;
    const loadInitialBrands = async () => {
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .order('display_order', { ascending: true })
        .order('brand_name', { ascending: true });
        
      if (isMounted && !error) {
        const sortedBrands = (data || []).sort((a, b) => {
          const orderA = a.display_order ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.display_order ?? Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) return orderA - orderB;
          return (a.brand_name || '').localeCompare(b.brand_name || '');
        });
        setBrands(sortedBrands);
        setLoading(false);
      }
    };
    
    const executeFetch = async () => {
      await Promise.resolve();
      if (isMounted) {
        loadInitialBrands();
      }
    };
    executeFetch();

    return () => { isMounted = false; };
  }, [refreshTrigger]);

  // Derived Stats
  const categoriesCount = useMemo(() => new Set(brands.map(b => b.category)).size, [brands]);
  
  const filteredBrands = useMemo(() => 
    brands.filter(b => b.brand_name.toLowerCase().includes(searchQuery.toLowerCase())), 
  [brands, searchQuery]);

  // Add New Brand
  const handleAddBrand = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    const initialPrice = parseFloat(formData.sellingPrice);
    const mrpPrice = parseFloat(formData.mrpPrice) || 0;
    
    const { data: brandData, error: brandError } = await supabase
      .from('brands')
      .insert([{
        brand_name: formData.brandName, 
        category: formData.category, 
        bottle_size: formData.bottleSize, 
        selling_price: initialPrice,
        mrp_price: mrpPrice,
      }])
      .select();

    if (!brandError && brandData && brandData[0]) {
      // Record initial price history
      await supabase.from('brand_price_history').insert([{ 
        brand_id: brandData[0].id, 
        user_id: user.id, 
        old_price: null, 
        new_price: initialPrice, 
        effective_date: new Date().toISOString().split('T')[0] 
      }]);
      
      setFormData({ brandName: '', category: 'Whisky', bottleSize: '750ml', sellingPrice: '', mrpPrice: '' });
      setLoading(true); // Safe to call inside event handlers
      fetchBrands();
    }
    setIsSubmitting(false);
  };

  // Open Edit Modal
  const openEditModal = (brand) => {
    setSelectedBrand(brand);
    setEditFormData({ 
      brandName: brand.brand_name, 
      category: brand.category, 
      bottleSize: brand.bottle_size 
    });
    setIsEditModalOpen(true);
  };

  // Submit Edit Form
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const { error: updateError } = await supabase
      .from('brands')
      .update({ 
        brand_name: editFormData.brandName, 
        category: editFormData.category, 
        bottle_size: editFormData.bottleSize 
      })
      .eq('id', selectedBrand.id);

    if (!updateError) {
      setIsEditModalOpen(false); 
      setLoading(true); // Safe to call inside event handlers
      fetchBrands(); 
    } else {
      alert("Error updating brand: " + updateError.message);
    }
    setIsSubmitting(false);
  };

  // Delete Handlers
  const handleDeleteClick = (brand) => {
    setBrandToDelete(brand);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!brandToDelete) return;
    setIsSubmitting(true);
    try { 
      await supabase.from('brands').delete().eq('id', brandToDelete.id); 
      setIsDeleteModalOpen(false); 
      setBrandToDelete(null); 
      setLoading(true); // Safe to call inside event handlers
      fetchBrands(); 
    } catch { 
      alert("Error deleting brand. It might be linked to existing stock records."); 
    } finally { 
      setIsSubmitting(false); 
    }
  };

  // Fetch Price History
  const fetchPriceHistory = async (brand) => {
    setSelectedBrand(brand); 
    setHistoryLoading(true); 
    setIsHistoryModalOpen(true);
    
    const { data } = await supabase
      .from('brand_price_history')
      .select('*')
      .eq('brand_id', brand.id)
      .order('created_at', { ascending: false });
      
    setPriceHistory(data || []); 
    setHistoryLoading(false);
  };

  const inputClass = "w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-sm";

  return (
    <div className="space-y-6 transition-colors duration-300">
      
      {/* Header & Stats */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            <Tag className="text-blue-500" /> Brand Master
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Manage your product catalog, categories, and tracking.</p>
        </div>

        <div className="flex gap-4">
          <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 px-5 py-3 rounded-2xl border border-slate-100 dark:border-slate-800">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
              <Wine size={20}/>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">Total Brands</p>
              <h4 className="text-xl font-black text-slate-800 dark:text-slate-100 leading-none">{brands.length}</h4>
            </div>
          </div>
          
          <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 px-5 py-3 rounded-2xl border border-slate-100 dark:border-slate-800">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl text-emerald-600 dark:text-emerald-400">
              <Layers size={20}/>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">Categories</p>
              <h4 className="text-xl font-black text-slate-800 dark:text-slate-100 leading-none">{categoriesCount}</h4>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Side: Add Brand Form */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 h-fit">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2 border-b border-slate-50 dark:border-slate-800 pb-4">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
              <Plus size={18} />
            </div>
            Register New Product
          </h3>
          
          <form onSubmit={handleAddBrand} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                Brand Name
              </label>
              <input 
                type="text" 
                required 
                value={formData.brandName} 
                onChange={(e) => setFormData({ ...formData, brandName: e.target.value })} 
                className={inputClass} 
                placeholder="e.g., Royal Stag" 
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Category
                </label>
                <select 
                  value={formData.category} 
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })} 
                  className={inputClass}
                >
                  <option value="Whisky">Whisky</option>
                  <option value="Beer">Beer</option>
                  <option value="Rum">Rum</option>
                  <option value="Vodka">Vodka</option>
                  <option value="Wine">Wine</option>
                  <option value="Gin">Gin</option>
                  <option value="Brandy">Brandy</option>
                  <option value="Desi Daru">Desi Daru</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Bottle Size
                </label>
                <select 
                  value={formData.bottleSize} 
                  onChange={(e) => setFormData({ ...formData, bottleSize: e.target.value })} 
                  className={inputClass}
                >
                  <option value="90ml">90ml</option>
                  <option value="180ml">180ml</option>
                  <option value="330ml">330ml</option>
                  <option value="375ml">375ml</option>
                  <option value="500ml">500ml</option>
                  <option value="650ml">650ml</option>
                  <option value="750ml">750ml</option>
                  <option value="1000ml">1000ml</option>
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  MRP Price (₹)
                </label>
                <input 
                  type="number" 
                  required min="0" 
                  value={formData.mrpPrice} 
                  onChange={(e) => setFormData({ ...formData, mrpPrice: e.target.value })} 
                  className={inputClass} 
                  placeholder="0.00" 
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Base Price (₹)
                </label>
                <input 
                  type="number" 
                  required min="0" 
                  value={formData.sellingPrice} 
                  onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })} 
                  className={inputClass} 
                  placeholder="0.00" 
                />
              </div>
            </div>
            
            <button 
              type="submit" 
              disabled={isSubmitting} 
              className="w-full mt-4 bg-blue-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-blue-700 transition-all flex justify-center items-center gap-2 shadow-md"
            >
              {isSubmitting ? 'Saving...' : 'Save Product to Master'}
            </button>
          </form>
        </div>

        {/* Right Side: Brands Table with Search */}
        <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden h-fit flex flex-col">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-50/50 dark:bg-slate-900/50">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Layers size={18} className="text-slate-400" /> Inventory Catalog
            </h3>
            
            <div className="relative w-full sm:w-64">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Search size={16}/>
              </span>
              <input 
                type="text" 
                placeholder="Search brands..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none text-slate-700 dark:text-slate-200"
              />
            </div>
          </div>
          
          <div className="overflow-x-auto flex-1 custom-scrollbar max-h-150">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-white dark:bg-slate-900 text-slate-400 font-semibold uppercase text-[11px] tracking-wider sticky top-0 border-b border-slate-100 dark:border-slate-800 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-4">Brand Details</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4 text-right">MRP Price (₹)</th>
                  <th className="px-6 py-4 text-right">Base Price (₹)</th>
                  <th className="px-6 py-4 text-center">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-slate-400">
                      Loading catalog...
                    </td>
                  </tr>
                ) : filteredBrands.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-slate-400">
                      No matching products found.
                    </td>
                  </tr>
                ) : (
                  filteredBrands.map((brand) => (
                    <tr key={brand.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800 dark:text-slate-100 text-base">
                          {brand.brand_name}
                        </div>
                        <div className="text-xs text-slate-500 font-medium mt-0.5">
                          {brand.bottle_size}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 rounded-md text-[11px] font-bold uppercase tracking-wider border border-slate-200 dark:border-slate-700">
                          {brand.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-black text-slate-500 dark:text-slate-400 text-base">
                        ₹{brand.mrp_price !== undefined && brand.mrp_price !== null ? brand.mrp_price : '0'}
                      </td>
                      <td className="px-6 py-4 text-right font-black text-slate-800 dark:text-slate-100 text-base">
                        ₹{brand.selling_price}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => fetchPriceHistory(brand)} 
                            title="History" 
                            className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg outline-none transition-colors"
                          >
                            <History size={16} />
                          </button>
                          <button 
                            onClick={() => openEditModal(brand)} 
                            title="Edit" 
                            className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg outline-none transition-colors"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDeleteClick(brand)} 
                            title="Delete" 
                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg outline-none transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- CUSTOM DELETE MODAL --- */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-9999 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                Delete Product?
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Are you sure you want to permanently remove <strong className="text-slate-800 dark:text-slate-200">{brandToDelete?.brand_name}</strong>? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)} 
                  className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold py-3 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDelete} 
                  className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-colors shadow-md"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- EDIT MODAL (REMOVED SELLING PRICE) --- */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-9999 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
            
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Edit2 size={18} className="text-blue-500" /> Edit Product Master
              </h3>
              <button 
                onClick={() => setIsEditModalOpen(false)} 
                className="p-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-red-500 hover:text-white rounded-full transition-colors outline-none"
              >
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Brand Name
                </label>
                <input 
                  type="text" 
                  required 
                  value={editFormData.brandName} 
                  onChange={(e) => setEditFormData({ ...editFormData, brandName: e.target.value })} 
                  className={inputClass} 
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Category
                  </label>
                  <select 
                    value={editFormData.category} 
                    onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })} 
                    className={inputClass}
                  >
                    <option value="Whisky">Whisky</option>
                    <option value="Beer">Beer</option>
                    <option value="Rum">Rum</option>
                    <option value="Vodka">Vodka</option>
                    <option value="Wine">Wine</option>
                    <option value="Gin">Gin</option>
                    <option value="Brandy">Brandy</option>
                    <option value="Desi Daru">Desi Daru</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Bottle Size
                  </label>
                  <select 
                    value={editFormData.bottleSize} 
                    onChange={(e) => setEditFormData({ ...editFormData, bottleSize: e.target.value })} 
                    className={inputClass}
                  >
                    <option value="90ml">90ml</option>
                    <option value="180ml">180ml</option>
                    <option value="330ml">330ml</option>
                    <option value="375ml">375ml</option>
                    <option value="500ml">500ml</option>
                    <option value="650ml">650ml</option>
                    <option value="750ml">750ml</option>
                    <option value="1000ml">1000ml</option>
                  </select>
                </div>
              </div>
              
              <button 
                type="submit" 
                disabled={isSubmitting} 
                className="w-full mt-2 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-md"
              >
                Update Product
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- PRICE HISTORY MODAL --- */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-9999 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[80vh]">
            
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <History size={18} className="text-indigo-500" /> Price History Logs
                </h3>
                <p className="text-xs text-slate-500 mt-1 font-semibold uppercase tracking-wider">
                  {selectedBrand?.brand_name} • {selectedBrand?.bottle_size}
                </p>
              </div>
              <button 
                onClick={() => setIsHistoryModalOpen(false)} 
                className="p-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-red-500 hover:text-white rounded-full transition-colors outline-none"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-0 overflow-y-auto flex-1 custom-scrollbar">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-white dark:bg-slate-950 text-slate-400 font-semibold uppercase text-[11px] tracking-wider sticky top-0">
                  <tr>
                    <th className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">Effective Date</th>
                    <th className="px-6 py-4 text-right border-b border-slate-100 dark:border-slate-800">Old Price</th>
                    <th className="px-6 py-4 text-right border-b border-slate-100 dark:border-slate-800">New Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                  {historyLoading ? (
                    <tr>
                      <td colSpan="3" className="px-6 py-12 text-center text-slate-400">
                        Loading history...
                      </td>
                    </tr>
                  ) : priceHistory.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="px-6 py-12 text-center text-slate-400">
                        No price changes recorded yet.
                      </td>
                    </tr>
                  ) : (
                    priceHistory.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800 dark:text-slate-100">
                            {new Date(log.effective_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                          <div className="text-xs text-slate-400 font-medium mt-0.5">
                            {new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-slate-400 font-medium line-through">
                          {log.old_price ? `₹${log.old_price}` : '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-black text-emerald-600 dark:text-emerald-400">
                          ₹{log.new_price}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}