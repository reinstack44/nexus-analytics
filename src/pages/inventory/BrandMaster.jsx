import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../config/supabaseClient';
import { Plus, Tag, Edit2, Trash2, X, AlertTriangle } from 'lucide-react';

export default function BrandMaster() {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    brandName: '',
    category: 'Whisky',
    bottleSize: '750ml',
    sellingPrice: '',
  });

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [brandToDelete, setBrandToDelete] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  // Fetch Brands
  const fetchBrands = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching brands:', error.message);
    } else {
      setBrands(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBrands();
  }, [fetchBrands]);

  // Handle Add Brand
  const handleAddBrand = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const { error } = await supabase
      .from('brands')
      .insert([
        {
          brand_name: formData.brandName,
          category: formData.category,
          bottle_size: formData.bottleSize,
          selling_price: parseFloat(formData.sellingPrice),
        },
      ]);

    if (error) {
      alert('Error adding brand: ' + error.message);
    } else {
      setFormData({ brandName: '', category: 'Whisky', bottleSize: '750ml', sellingPrice: '' });
      fetchBrands();
    }
    setIsSubmitting(false);
  };

  // Handle Edit
  const openEditModal = (brand) => {
    setSelectedBrand(brand);
    setEditFormData({
      brandName: brand.brand_name,
      category: brand.category,
      bottleSize: brand.bottle_size,
      sellingPrice: brand.selling_price,
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    const { error } = await supabase
      .from('brands')
      .update({
        brand_name: editFormData.brandName,
        category: editFormData.category,
        bottle_size: editFormData.bottleSize,
        selling_price: parseFloat(editFormData.sellingPrice),
      })
      .eq('id', selectedBrand.id);

    if (error) {
      alert("Error updating brand: " + error.message);
    } else {
      setIsEditModalOpen(false);
      fetchBrands();
    }
    setIsSubmitting(false);
  };

  // Handle Delete
  const handleDeleteClick = (brand) => {
    setBrandToDelete(brand);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!brandToDelete) return;
    setIsSubmitting(true);

    try {
      const { error } = await supabase.from('brands').delete().eq('id', brandToDelete.id);
      if (error) throw error;
      
      setIsDeleteModalOpen(false);
      setBrandToDelete(null);
      fetchBrands();
    } catch (error) {
      alert("Error deleting brand. It might be linked to existing stock records.\n" + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = "w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all duration-300 text-sm";

  return (
    <div className="space-y-6 transition-colors duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight transition-colors duration-300">Brand Master</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 transition-colors duration-300">Manage your product catalog, sizes, and default selling prices.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Add Brand Form */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 h-fit transition-colors duration-300">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-2 border-b border-slate-50 dark:border-slate-800 pb-4 transition-colors duration-300">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 transition-colors duration-300">
              <Plus size={18} />
            </div>
            Create New Brand
          </h3>
          
          <form onSubmit={handleAddBrand} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 transition-colors duration-300">Brand Name</label>
              <input type="text" required value={formData.brandName} onChange={(e) => setFormData({ ...formData, brandName: e.target.value })} className={inputClass} placeholder="e.g., Royal Stag, Kingfisher" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 transition-colors duration-300">Category</label>
                <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className={inputClass}>
                  <option value="Whisky">Whisky</option>
                  <option value="Beer">Beer</option>
                  <option value="Rum">Rum</option>
                  <option value="Vodka">Vodka</option>
                  <option value="Wine">Wine</option>
                  <option value="Gin">Gin</option>
                  <option value="Brandy">Brandy</option>
                  <option value="Desi Daru">Desi Daru (Country Liquor)</option>
                  <option value="Tequila">Tequila</option>
                  <option value="Liqueur">Liqueur</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 transition-colors duration-300">Bottle Size</label>
                <select value={formData.bottleSize} onChange={(e) => setFormData({ ...formData, bottleSize: e.target.value })} className={inputClass}>
                  <option value="90ml">90ml (Nip)</option>
                  <option value="180ml">180ml (Quarter)</option>
                  <option value="330ml">330ml (Pint Beer)</option>
                  <option value="375ml">375ml (Half / Pint)</option>
                  <option value="500ml">500ml (Can / Bottle)</option>
                  <option value="650ml">650ml (Standard Beer)</option>
                  <option value="750ml">750ml (Quart / Full)</option>
                  <option value="1000ml">1000ml (1 Litre)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 transition-colors duration-300">Selling Price (₹)</label>
              <input type="number" required min="0" value={formData.sellingPrice} onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })} className={inputClass} placeholder="0.00" />
            </div>

            <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-blue-600 text-white font-medium py-2.5 px-4 rounded-xl hover:bg-blue-700 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900 transition-all duration-300 disabled:opacity-50 flex justify-center items-center gap-2 shadow-sm">
              {isSubmitting ? 'Saving...' : 'Save Brand'}
            </button>
          </form>
        </div>

        {/* Right Side: Brands Table */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden h-fit flex flex-col transition-colors duration-300">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 transition-colors duration-300">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 transition-colors duration-300">
              <Tag size={18} className="text-slate-400 dark:text-slate-500" />
              Registered Brands
            </h3>
            <span className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-full uppercase tracking-wide transition-colors duration-300">
              Total: {brands.length}
            </span>
          </div>
          
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold uppercase text-xs tracking-wider transition-colors duration-300">
                <tr>
                  <th className="px-6 py-4">Brand Details</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4 text-right">Selling Price (₹)</th>
                  <th className="px-6 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 transition-colors duration-300">
                {loading ? (
                  <tr><td colSpan="4" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">Loading data...</td></tr>
                ) : brands.length === 0 ? (
                  <tr><td colSpan="4" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">No brands found. Please create a brand to start.</td></tr>
                ) : (
                  brands.map((brand) => (
                    <tr key={brand.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors duration-300">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-100 transition-colors duration-300">{brand.brand_name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 transition-colors duration-300">{brand.bottle_size}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-700 transition-colors duration-300">{brand.category}</span>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-slate-800 dark:text-slate-100 transition-colors duration-300">₹{brand.selling_price}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center items-center gap-2">
                          <button onClick={() => openEditModal(brand)} title="Edit Brand" className="p-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors outline-none"><Edit2 size={18} /></button>
                          <button onClick={() => handleDeleteClick(brand)} title="Delete Brand" className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors outline-none"><Trash2 size={18} /></button>
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
        <div className="fixed inset-0 z-100 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle size={20} /> Delete Confirmation
              </h3>
              <button onClick={() => setIsDeleteModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 outline-none"><X size={20} /></button>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                Are you sure you want to delete <strong className="text-slate-800 dark:text-slate-100">{brandToDelete?.brand_name}</strong>? 
                This action cannot be undone.
              </p>
              <div className="flex items-center gap-3 mt-6">
                <button onClick={() => setIsDeleteModalOpen(false)} disabled={isSubmitting} className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium py-2.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={confirmDelete} disabled={isSubmitting} className="flex-1 bg-red-600 text-white font-medium py-2.5 rounded-xl hover:bg-red-700 focus:ring-4 focus:ring-red-100 dark:focus:ring-red-900 transition-all duration-300 disabled:opacity-50">
                  {isSubmitting ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- EDIT MODAL --- */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-100 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Edit2 size={18} className="text-blue-500" /> Edit Product
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 outline-none"><X size={20} /></button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Brand Name</label>
                <input type="text" required value={editFormData.brandName} onChange={(e) => setEditFormData({ ...editFormData, brandName: e.target.value })} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Category</label>
                  <select value={editFormData.category} onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })} className={inputClass}>
                    <option value="Whisky">Whisky</option>
                    <option value="Beer">Beer</option>
                    <option value="Rum">Rum</option>
                    <option value="Vodka">Vodka</option>
                    <option value="Wine">Wine</option>
                    <option value="Gin">Gin</option>
                    <option value="Brandy">Brandy</option>
                    <option value="Desi Daru">Desi Daru (Country Liquor)</option>
                    <option value="Tequila">Tequila</option>
                    <option value="Liqueur">Liqueur</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Bottle Size</label>
                  <select value={editFormData.bottleSize} onChange={(e) => setEditFormData({ ...editFormData, bottleSize: e.target.value })} className={inputClass}>
                    <option value="90ml">90ml (Nip)</option>
                    <option value="180ml">180ml (Quarter)</option>
                    <option value="330ml">330ml (Pint Beer)</option>
                    <option value="375ml">375ml (Pint)</option>
                    <option value="500ml">500ml (Can / Bottle)</option>
                    <option value="650ml">650ml (Standard Beer)</option>
                    <option value="750ml">750ml (Quart)</option>
                    <option value="1000ml">1000ml</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Selling Price (₹)</label>
                <input type="number" required min="0" value={editFormData.sellingPrice} onChange={(e) => setEditFormData({ ...editFormData, sellingPrice: e.target.value })} className={inputClass} />
              </div>
              <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-blue-600 text-white font-medium py-2.5 rounded-xl hover:bg-blue-700 transition-colors">
                {isSubmitting ? 'Updating...' : 'Update Details'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}