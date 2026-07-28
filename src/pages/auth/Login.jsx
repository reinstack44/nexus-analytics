import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../config/supabaseClient';
import { Mail, Lock, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import logoImg from '../../assets/nx diary logo.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const canvasRef = useRef(null);
  const [mousePos, setMousePos] = useState({ x: -300, y: -300 });

  // High-performance HTML5 Canvas Shimmer Powder Engine (Strictly matching the reference image)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    let particles = [];

    class ShimmerPowder {
      constructor(x, y) {
        this.x = x;
        this.y = y;
        
        // Multi-layered particle definitions strictly matching the reference image texture
        const randType = Math.random();
        if (randType > 0.88) {
          // 1. Intense bright white star glint
          this.type = 'glint';
          this.size = Math.random() * 1.4 + 1.1;
          this.color = '#ffffff';
        } else if (randType > 0.65) {
          // 2. Soft out-of-focus royal blue circular bokeh halos
          this.type = 'bokeh';
          this.size = Math.random() * 7 + 4;
          this.color = Math.random() > 0.5 ? '#1d4ed8' : '#2563eb';
        } else {
          // 3. Sharp microscopic cyan/indigo metallic dust specks
          this.type = 'speck';
          this.size = Math.random() * 1.1 + 0.4;
          this.color = Math.random() > 0.6 ? '#06b6d4' : '#1e40af';
        }
        
        // Micro-kinematics for a quiet, professional drift
        this.vx = (Math.random() - 0.5) * 1.0;
        this.vy = (Math.random() - 0.5) * 1.0 - 0.2; // Gentle floating upward drift
        this.alpha = 1.0;
        this.decay = Math.random() * 0.016 + 0.010;
        this.twinkleSpeed = Math.random() * 0.12 + 0.05;
      }
      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= this.decay;
      }
      draw(context) {
        context.save();
        
        // Twitch twinkle frequency
        const shimmer = Math.abs(Math.sin(Date.now() * this.twinkleSpeed)) * 0.7 + 0.3;
        context.globalAlpha = this.alpha * shimmer;

        if (this.type === 'bokeh') {
          // Ambient soft circular background glow matching reference image
          context.shadowBlur = 15;
          context.shadowColor = this.color;
          context.fillStyle = 'rgba(37, 99, 235, 0.12)';
          context.beginPath();
          context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          context.fill();
        } else if (this.type === 'glint') {
          // Brilliant sharp starry flash
          context.shadowBlur = 12;
          context.shadowColor = '#3b82f6';
          context.fillStyle = '#ffffff';
          context.beginPath();
          context.moveTo(this.x, this.y - this.size * 2);
          context.lineTo(this.x + this.size * 0.6, this.y);
          context.lineTo(this.x, this.y + this.size * 2);
          context.lineTo(this.x - this.size * 0.6, this.y);
          context.closePath();
          context.fill();
        } else {
          // Sharp microscopic neon cyan/blue metallic dust speck
          context.shadowBlur = 8;
          context.shadowColor = this.color;
          context.fillStyle = this.color;
          context.fillRect(this.x, this.y, this.size, this.size);
        }
        
        context.restore();
      }
    }

    const render = () => {
      // Obsidian-slate clearing to eliminate stutters and create royal blue trails
      ctx.fillStyle = 'rgba(3, 5, 16, 0.22)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p, idx) => {
        p.update();
        p.draw(ctx);
        if (p.alpha <= 0) {
          particles.splice(idx, 1);
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };
    render();

    let lastX = 0;
    let lastY = 0;

    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });

      // Spawns particles ONLY when cursor has traveled at least 8 pixels (Minimal & Non-intrusive)
      const distance = Math.hypot(e.clientX - lastX, e.clientY - lastY);
      if (distance > 8) {
        particles.push(new ShimmerPowder(e.clientX, e.clientY));
        lastX = e.clientX;
        lastY = e.clientY;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      setError(loginError.message);
    }
    setLoading(false);
  };

  // High-fidelity borderless translucent inputs
  const inputClass = "w-full pl-11 pr-4 py-4 bg-slate-950/60 dark:bg-slate-950/90 border border-white/5 text-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/40 outline-none transition-all duration-300 text-sm font-semibold shadow-[0_0_20px_rgba(6,182,212,0.03)] placeholder-slate-650";

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#030510] px-4 sm:px-6 lg:px-8 font-sans transition-colors duration-500 relative overflow-hidden perspective-3d">
      
      {/* Dynamic 3D Electric Grid Style Injection */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes grid-move {
          0% { transform: translateY(0); }
          100% { transform: translateY(50px); }
        }
        .perspective-3d {
          perspective: 1000px;
        }
        .grid-3d-floor {
          transform: rotateX(65deg) scale(2.2);
          background-image: 
            linear-gradient(to right, rgba(37, 99, 235, 0.04) 1.5px, transparent 1px),
            linear-gradient(to bottom, rgba(37, 99, 235, 0.04) 1.5px, transparent 1px);
          background-size: 50px 50px;
          animation: grid-move 5s linear infinite;
        }
      `}} />

      {/* ================= GPU-ACCELERATED SHIMMERING CANVASES ================= */}
      <canvas ref={canvasRef} className="absolute inset-0 z-10 pointer-events-none block" />

      {/* ================= 3D ENVIRONMENT BACKDROP ================= */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Neon electric floor grid */}
        <div className="absolute inset-0 grid-3d-floor origin-center"></div>
        
        {/* Soft atmospheric gradient masking */}
        <div 
          className="absolute inset-0" 
          style={{ 
            background: 'radial-gradient(circle at 50% 50%, rgba(3, 5, 16, 0) 0%, #030510 85%)' 
          }}
        ></div>

        {/* Breathing backdrop lights */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-140 h-140 bg-indigo-600/5 rounded-full blur-[140px]"></div>
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-100 h-100 bg-blue-600/5 rounded-full blur-[120px]"></div>
      </div>

      {/* ================= INTERACTIVE DUAL-GLOW AURA ================= */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Deep royal-blue breathing spotlight */}
        <div 
          className="absolute w-96 h-96 bg-linear-to-r from-blue-600/10 to-indigo-600/10 rounded-full blur-[90px] transition-all duration-300 ease-out"
          style={{ 
            left: `${mousePos.x - 192}px`, 
            top: `${mousePos.y - 192}px` 
          }}
        ></div>
      </div>

      {/* ================= SEAMLESS BORDERLESS FORM CONSOLE ================= */}
      <div className="relative z-20 w-full max-w-sm flex flex-col gap-8 animate-in fade-in zoom-in-95 duration-700">
        
        {/* Brand Logo & Typography with custom halo flare */}
        <div className="flex flex-col items-center select-none">
          <div className="relative mb-4 group">
            {/* Bright cyan-purple flare behind logo */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 bg-linear-to-r from-blue-500/20 to-indigo-500/20 rounded-full blur-2xl pointer-events-none group-hover:opacity-100 transition-all duration-500"></div>
            
            <img 
              src={logoImg} 
              alt="Nexus Diary Logo" 
              className="h-20 w-auto object-contain relative z-10 filter drop-shadow-[0_2px_20px_rgba(37,99,235,0.3)] animate-pulse duration-10000"
            />
          </div>
          <h2 className="text-xl font-black text-white tracking-widest uppercase relative z-10">
            Nexus Diary
          </h2>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.25em] mt-1.5 relative z-10">
            Secure Business Dashboard
          </p>
        </div>

        {/* Alert console */}
        {error && (
          <div className="flex items-start gap-3 bg-red-950/20 border border-red-900/30 text-red-400 p-4 rounded-2xl text-xs font-semibold animate-in slide-in-from-top-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <p className="leading-relaxed">{error}</p>
          </div>
        )}

        {/* Input Fields */}
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-2.5">
              Email Address
            </label>
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors duration-300">
                <Mail size={16} />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="Enter your email"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-2.5">
              Secure Password
            </label>
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors duration-300">
                <Lock size={16} />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 bg-linear-to-r from-blue-600 to-indigo-650 hover:from-blue-700 hover:to-indigo-750 text-white font-bold py-3.5 px-4 rounded-2xl transition-all duration-300 disabled:opacity-70 flex justify-center items-center gap-2 shadow-[0_8px_30px_rgba(37,99,235,0.15)] dark:shadow-[0_12px_45px_rgba(79,70,229,0.25)] hover:shadow-[0_16px_50px_rgba(37,99,235,0.35)] hover:-translate-y-0.5 text-sm cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Authenticating System...
              </>
            ) : (
              <>
                Access System <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="mt-6 border-t border-white/5 pt-6 text-center select-none">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
            © {new Date().getFullYear()} Nexus Diary
          </p>
        </div>

      </div>
    </div>
  );
}