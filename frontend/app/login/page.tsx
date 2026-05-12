"use client";

import { useState } from "react";
import { supabase } from "../../src/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState({ texto: "", tipo: "" });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMensagem({ texto: "", tipo: "" });

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Redireciona de volta para a página inicial após o login
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      setMensagem({ texto: "Erro ao enviar o link. Tente novamente.", tipo: "erro" });
    } else {
      setMensagem({ 
        texto: "Link mágico enviado! Verifique sua caixa de entrada (e o spam).", 
        tipo: "sucesso" 
      });
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">LicitaBot</h1>
          <p className="text-slate-500 mt-2 text-sm">
            Acesse sua conta para visualizar as oportunidades
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
              Seu e-mail profissional
            </label>
            <input
              id="email"
              type="email"
              required
              placeholder="exemplo@empresa.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 rounded-lg border border-slate-300 shadow-sm focus:ring-2 focus:ring-slate-800 focus:border-slate-800 outline-none transition-all text-slate-700"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 text-white font-semibold py-3 px-4 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center"
          >
            {loading ? (
              <span className="animate-pulse">Enviando link...</span>
            ) : (
              "Receber Link de Acesso"
            )}
          </button>
        </form>

        {mensagem.texto && (
          <div className={`mt-6 p-4 rounded-lg text-sm text-center font-medium ${
            mensagem.tipo === "erro" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"
          }`}>
            {mensagem.texto}
          </div>
        )}
      </div>
    </main>
  );
} 