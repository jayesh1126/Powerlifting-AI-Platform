"use client";

import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";

export function LoginButton() {
  const handleGoogleLogin = async () => {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        console.error("[Login Error]", error);
        toast.error("Login failed. Please try again.");
      }
    } catch (err) {
      console.error("[Login Error]", err);
      toast.error("Something went wrong while logging in. Please try again.");
    }
  };

  return (
    <button
      onClick={handleGoogleLogin}
      className="cursor-pointer flex items-center justify-center gap-3 w-full max-w-sm mx-auto px-5 py-3 rounded-full bg-black text-white font-semibold hover:bg-gray-900 transition-all duration-300 shadow-md"
    >
      <svg className="w-5 h-5" viewBox="0 0 533.5 544.3" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M533.5 278.4c0-17.7-1.4-35-4.1-51.6H272v97.7h146.9c-6.3 34.2-25.1 63.2-53.6 82.6v68h86.9c50.8-46.8 81.3-115.7 81.3-196.7z"
          fill="#4285f4"
        />
        <path
          d="M272 544.3c72.6 0 133.5-24 178-65.3l-86.9-68c-24.1 16.2-54.9 25.8-91.1 25.8-70.1 0-129.5-47.4-150.7-111.1h-89.4v69.6c44.2 87.1 135.3 149 239.9 149z"
          fill="#34a853"
        />
        <path
          d="M121.3 325.7c-10.4-30.6-10.4-63.8 0-94.4V161.7h-89.4C7.5 199.3 0 238.1 0 278.5s7.5 79.2 31.9 116.8l89.4-69.6z"
          fill="#fbbc04"
        />
        <path
          d="M272 109.3c39.6-.6 77.5 14.6 106.5 42.3l79.6-79.6C406.2 26.5 341.3-.1 272 0 168.4 0 77.3 61.8 33.1 148.9l89.4 69.6C142.5 156.7 201.9 109.3 272 109.3z"
          fill="#ea4335"
        />
      </svg>
      <span>Sign in with Google</span>
    </button>
  );
}
