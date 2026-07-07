import { useState, useEffect, useCallback, forwardRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { FileText, IndianRupee, TrendingUp, Download, FileSpreadsheet, Printer, Calendar, ChevronDown } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// Premium Custom Dropdown Button Date Picker ke liye - Added Dark Mode support
const CustomDateInput = forwardRef(({ value, onClick, placeholder }, ref) => (
  <button
    onClick={onClick}
    ref={ref}
    className="flex items-center px-4 py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-200 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-500/50"
  >
    <Calendar size={16} className="text-blue-500 mr-2" />
    {value || placeholder}
    <ChevronDown size={14} className="text-slate-400 dark:text-slate-500 ml-3" />
  </button>
));
CustomDateInput.displayName = "CustomDateInput";

export default function Reports() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Default dates: Current Date (Aaj ki date) par set kiya gaya hai
  const today = new Date();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const [summary, setSummary] = useState({ totalRevenue: 0, totalBottles: 0 });
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Helper function: Date object ko YYYY-MM-DD me convert karne ke liye for Database
  const formatDateForDB = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fetchReportData = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);

    const startStr = formatDateForDB(startDate);
    const endStr = formatDateForDB(endDate);

    const { data, error } = await supabase
      .from('daily_sales')
      .select(`id, quantity_sold, sale_date, brands (brand_name, bottle_size, selling_price)`)
      .gte('sale_date', startStr) 
      .lte('sale_date', endStr)   
      .order('sale_date', { ascending: false });

    if (error) {
      console.error('Error fetching reports:', error.message);
    } else if (data) {
      setSales(data);
      let revenue = 0; let bottles = 0;
      data.forEach(s => { 
        bottles += s.quantity_sold; 
        revenue += (s.quantity_sold * s.brands.selling_price); 
      });
      setSummary({ totalRevenue: revenue, totalBottles: bottles });
    }
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    // eslint-disable-next-line
    fetchReportData();
  }, [fetchReportData]);

  // Export to CSV Logic
  const exportToCSV = () => {
    const startStr = formatDateForDB(startDate);
    const endStr = formatDateForDB(endDate);
    const headers = ['Date,Brand Name,Size,Quantity Sold,Total Amount (Rs)'];
    const rows = sales.map(s => `${s.sale_date},"${s.brands.brand_name}","${s.brands.bottle_size}",${s.quantity_sold},${s.quantity_sold * s.brands.selling_price}`);
    const csvContent = headers.concat(rows).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Nexus_Sales_Report_${startStr}_to_${endStr}.csv`;
    link.click();
    setIsExportMenuOpen(false);
  };

  const printReport = () => {
    window.print();
    setIsExportMenuOpen(false);
  };

  return (
    <div className="space-y-6 transition-colors duration-300">
      <style>{`
      /* Global Datepicker Fixes */
        .react-datepicker-popper { z-index: 99999 !important; }
        .react-datepicker { z-index: 99999 !important; }
        
        /* Dashboard cards ka container z-index kam rakho */
        .dashboard-container { z-index: 1 !important; }
        
        /* Print Styles */
        @media print { 
          body * { visibility: hidden; } 
          #printable-report, #printable-report * { visibility: visible; } 
          #printable-report { position: absolute; left: 0; top: 0; width: 100%; } 
          .no-print { display: none !important; } 
        }

        /* 100% Solid & Clean DatePicker Styling */
        .react-datepicker-wrapper { display: block; }
        .react-datepicker-popper {
          z-index: 99999 !important;
        }
        .react-datepicker { 
          background-color: #ffffff !important; 
          border: 1px solid #e2e8f0 !important; 
          border-radius: 1.25rem !important; 
          box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1) !important; 
          font-family: inherit !important; 
          padding: 0.75rem !important;
          overflow: hidden;
        }
        .react-datepicker__month-container {
          background-color: #ffffff !important;
        }
        .react-datepicker__header { 
          background-color: #ffffff !important; 
          border-bottom: 1px solid #f8fafc !important; 
          padding-top: 0.25rem !important;
        }
        
        /* Adjusted Spacing for Month Title */
        .react-datepicker__current-month { 
          color: #1e293b; 
          font-weight: 700; 
          font-size: 1rem; 
          margin-bottom: 1rem !important; 
        }

        /* Month & Year Dropdown Clean Styling */
        .react-datepicker__header select {
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 0.5rem;
          padding: 0.25rem 0.5rem;
          font-weight: 600;
          color: #1e293b;
          outline: none;
          cursor: pointer;
          margin: 0 0.25rem 0.75rem 0.25rem; 
        }
        .react-datepicker__header select:focus {
          border-color: #3b82f6;
        }
        
        .react-datepicker__day-name { 
          color: #94a3b8 !important; 
          font-weight: 600 !important; 
          width: 2.25rem !important;
          margin: 0.1rem !important;
        }
        
        /* Clean Circular Days */
        .react-datepicker__day { 
          color: #334155 !important; 
          border-radius: 50% !important; 
          width: 2.25rem !important;
          line-height: 2.25rem !important;
          transition: all 0.2s ease !important; 
          margin: 0.1rem !important;
          background-color: transparent !important;
        }
        .react-datepicker__day:hover { 
          background-color: #f1f5f9 !important; 
          color: #0f172a !important;
        }
        
        /* Highlight only the purely selected date */
        .react-datepicker__day--selected, 
        .react-datepicker__day--keyboard-selected { 
          background-color: #2563eb !important; 
          color: #ffffff !important; 
          font-weight: 600 !important; 
          box-shadow: 0 4px 6px -1px rgb(37 99 235 / 0.4) !important;
        }
        
        /* Hide Triangle Arrow */
        .react-datepicker__triangle { display: none !important; }

        /* Dark Mode Overrides for DatePicker */
        .dark .react-datepicker { background-color: #0f172a !important; border-color: #1e293b !important; }
        .dark .react-datepicker__month-container { background-color: #0f172a !important; }
        .dark .react-datepicker__header { background-color: #0f172a !important; border-color: #1e293b !important; }
        .dark .react-datepicker__current-month { color: #f8fafc !important; }
        .dark .react-datepicker__header select { background-color: #1e293b !important; color: #f8fafc !important; border-color: #334155 !important; }
        .dark .react-datepicker__day-name { color: #64748b !important; }
        .dark .react-datepicker__day { color: #cbd5e1 !important; }
        .dark .react-datepicker__day:hover { background-color: #1e293b !important; color: #f8fafc !important; }
        .dark .react-datepicker__day--selected, .dark .react-datepicker__day--keyboard-selected { background-color: #3b82f6 !important; color: #ffffff !important; }
      `}</style>

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 no-print relative z-50">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2 transition-colors duration-300">
            <FileText className="text-blue-600" /> Analytics & Reports
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 transition-colors duration-300">Generate insights and export financial data.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          
          {/* Custom Date Range Picker Container */}
          <div className="flex items-center gap-2 bg-slate-100/50 dark:bg-slate-900/50 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner transition-colors duration-300">
            <DatePicker
              selected={startDate}
              onChange={(date) => setStartDate(date)}
              maxDate={new Date()}
              dateFormat="MMM dd, yyyy"
              customInput={<CustomDateInput />}
              showMonthDropdown
              showYearDropdown
              dropdownMode="select"
            />
            <span className="text-slate-400 dark:text-slate-500 font-medium px-1 transition-colors duration-300">to</span>
            <DatePicker
              selected={endDate}
              onChange={(date) => setEndDate(date)}
              minDate={startDate}
              maxDate={new Date()}
              dateFormat="MMM dd, yyyy"
              customInput={<CustomDateInput />}
              showMonthDropdown
              showYearDropdown
              dropdownMode="select"
            />
          </div>

          {/* Export Dropdown */}
          <div className="relative">
            <button 
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)} 
              className="flex items-center gap-2 bg-slate-800 dark:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors shadow-sm outline-none"
            >
              <Download size={16} /> Export Data
            </button>
            {isExportMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-lg py-2 z-50 transition-colors duration-300">
                <button 
                  onClick={exportToCSV} 
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 transition-colors"
                >
                  <FileSpreadsheet size={16} className="text-green-600 dark:text-green-400" /> Download Excel (CSV)
                </button>
                <button 
                  onClick={printReport} 
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 transition-colors"
                >
                  <Printer size={16} className="text-blue-600 dark:text-blue-400" /> Save as PDF / Print
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div id="printable-report" className="space-y-6 relative z-10">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-linear-to-br from-slate-800 to-slate-900 dark:from-slate-900 dark:to-black p-6 rounded-2xl shadow-sm text-white relative overflow-hidden group border border-transparent dark:border-slate-800 transition-colors duration-300">
            <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4 group-hover:scale-110 transition-transform duration-500">
              <IndianRupee size={120} />
            </div>
            <p className="text-slate-300 dark:text-slate-400 font-medium text-sm tracking-wider uppercase mb-2 relative z-10 transition-colors duration-300">Total Revenue</p>
            <h3 className="text-4xl font-bold relative z-10">₹{summary.totalRevenue.toLocaleString()}</h3>
          </div>

          <div className="bg-linear-to-br from-blue-600 to-blue-700 dark:from-blue-800 dark:to-blue-900 p-6 rounded-2xl shadow-sm text-white relative overflow-hidden group border border-transparent dark:border-blue-800/50 transition-colors duration-300">
            <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4 group-hover:scale-110 transition-transform duration-500">
              <TrendingUp size={120} />
            </div>
            <p className="text-blue-100 dark:text-blue-200 font-medium text-sm tracking-wider uppercase mb-2 relative z-10 transition-colors duration-300">Bottles Sold</p>
            <h3 className="text-4xl font-bold relative z-10">{summary.totalBottles}</h3>
          </div>
        </div>

        {/* Detailed Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden transition-colors duration-300">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 transition-colors duration-300">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider transition-colors duration-300">Detailed Transaction Ledger</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 font-semibold uppercase text-xs tracking-wider border-b border-slate-100 dark:border-slate-800 transition-colors duration-300">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Brand / Size</th>
                  <th className="px-6 py-4 text-center">Qty Sold</th>
                  <th className="px-6 py-4 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800 transition-colors duration-300">
                {loading ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">Compiling report...</td>
                  </tr>
                ) : sales.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">No records found for selected dates.</td>
                  </tr>
                ) : (
                  sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors duration-300">
                      <td className="px-6 py-4 font-medium text-slate-700 dark:text-slate-300 transition-colors duration-300">
                        {new Date(sale.sale_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-slate-800 dark:text-slate-100 transition-colors duration-300">{sale.brands.brand_name}</span>
                        <span className="text-slate-400 dark:text-slate-500 ml-2 text-xs border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-md transition-colors duration-300">{sale.brands.bottle_size}</span>
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-slate-700 dark:text-slate-300 transition-colors duration-300">{sale.quantity_sold}</td>
                      <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-100 text-right transition-colors duration-300">
                        ₹{(sale.quantity_sold * sale.brands.selling_price).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}