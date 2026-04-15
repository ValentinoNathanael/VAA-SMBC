"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Role = "spoc" | "internal";
type Modal = "none" | "change-password";

const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

function PasswordInput({
  value,
  onChange,
  placeholder,
  disabled,
  onKeyDown,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 pr-12 text-sm text-gray-900 outline-none transition-all duration-200 focus:border-green-700 focus:bg-white disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
      />
      {!disabled && (
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      )}
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("internal");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [modal, setModal] = useState<Modal>("none");

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changeError, setChangeError] = useState("");
  const [changeSuccess, setChangeSuccess] = useState("");
  const [changeLoading, setChangeLoading] = useState(false);
  const [oldPasswordError, setOldPasswordError] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");

  async function handleLogin() {
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        password,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error ?? "Login gagal");
      return;
    }
    router.push("/dashboard");
  }

  async function handleChangePassword() {
    setChangeError("");
    setChangeSuccess("");
    setOldPasswordError("");
    setNewPasswordError("");
    setConfirmPasswordError("");

    let hasError = false;

    if (!oldPassword) {
      setOldPasswordError("Old password is required");
      hasError = true;
    }

    const passwordRules = [
      { test: newPassword.length >= 8, msg: "Minimum 8 Characters" },
      { test: /[A-Z]/.test(newPassword), msg: "at least 1 uppercase letter" },
      { test: /[a-z]/.test(newPassword), msg: "at least 1 lowercase letter" },
      { test: /[0-9]/.test(newPassword), msg: "at least 1 number" },
      { test: /[^A-Za-z0-9]/.test(newPassword), msg: "at least 1 special character (!@#$%^&* etc)" },
    ];
    const failed = passwordRules.filter((r) => !r.test);
    if (!newPassword) {
      setNewPasswordError("New password is required.");
      hasError = true;
    } else if (failed.length > 0) {
      setNewPasswordError(`The new password must have:${failed.map((r) => r.msg).join(", ")}.`);
      hasError = true;
    }

    if (!confirmPassword) {
      setConfirmPasswordError("Password confirmation is required.");
      hasError = true;
    } else if (newPassword !== confirmPassword) {
      setConfirmPasswordError("Password confirmation does not match.");
      hasError = true;
    }

    if (hasError) return;

    const loginRes = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "spoc", password: oldPassword }),
    });
    if (!loginRes.ok) {
      setOldPasswordError("Old password is wrong.");
      return;
    }

    setChangeLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChangeError(data?.error ?? "Failed to change password.");
        return;
      }
      setChangeSuccess("Password changed successfully! Please log in with the new password.");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        setModal("none");
        setChangeSuccess("");
      }, 2500);
    } catch {
      setChangeError("Failed to contact server.");
    } finally {
      setChangeLoading(false);
    }
  }

function closeModal() {
  setModal("none");
  setOldPassword("");
  setNewPassword("");
  setConfirmPassword("");
  setChangeError("");
  setChangeSuccess("");
  setOldPasswordError("");
  setNewPasswordError("");
  setConfirmPasswordError("");
}

  return (
    <main className="relative min-h-screen overflow-hidden bg-linear-to-br from-[#022c22] via-[#014737] to-[#065f46]">
      <div className="pointer-events-none absolute -left-24 top-20 w-[320px] rounded-full bg-lime-300/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-30 right-30 h-30 rounded-full bg-emerald-200/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.10),transparent_25%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_20%)]" />

      <div className="relative flex min-h-screen items-center justify-center px-6 py-8">
        <div className="grid w-full max-w-6xl overflow-hidden rounded-4xl border border-white/10 bg-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:grid-cols-[1.1fr_0.9fr]">

          {/* LEFT SIDE */}
          <section className="relative hidden overflow-hidden bg-linear-to-br from-[#014737] via-[#025940] to-[#0b7a5c] p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.15),transparent_28%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.10),transparent_24%)]" />
            <div className="absolute -right-24 top-20 h-72 w-72 rounded-full border border-white/10" />
            <div className="absolute -right-10 top-36 h-52 w-52 rounded-full border border-white/10" />
            <div className="absolute -bottom-20 left-10 h-64 w-64 rounded-full border border-white/10" />

            <div className="relative z-10">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-white px-4 py-3 shadow-lg">
                  <img src="/Logo-SMBC.png" alt="SMBC" className="h-8 w-auto object-contain" />
                </div>
                <p className="text-xs uppercase tracking-[0.28em] text-white/70">Internal Access Platform</p>
              </div>

              <div className="mt-12 max-w-xl">
                <p className="text-sm uppercase tracking-[0.28em] text-lime-200/80">Welcome to VAA</p>
                <h2 className="mt-4 text-4xl font-bold leading-tight">
                  Smarter insights from your Excel data
                </h2>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
                  <p className="text-sm text-white/70">Protected role</p>
                  <p className="mt-2 text-base font-semibold">Strategic Planning &amp; Operations Control</p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
                  <p className="text-sm text-white/70">Access mode</p>
                  <p className="mt-2 text-base font-semibold">Internal User</p>
                </div>
              </div>
            </div>

            <div className="relative z-10 mt-8 text-sm text-white/65">
              <span>SMBC Indonesia • Internal Prototype</span>
            </div>
          </section>

          {/* RIGHT SIDE */}
          <section className="bg-white px-6 py-8 text-gray-900 sm:px-10 sm:py-10 lg:px-12 lg:py-10">
            <div className="mx-auto flex max-w-xl flex-col justify-center">

              <div className="mb-8 lg:hidden">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <img src="/smbc-logo.png" alt="SMBC" className="h-8 w-auto object-contain" />
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-green-800">Login</p>
                <h3 className="mt-3 text-3xl font-bold tracking-tight">Access VAA Platform</h3>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                  Choose your access role below. Password is required for all roles.
                </p>
              </div>

              <div className="mt-8 space-y-6">
                <div>
                  <label className="mb-3 block text-sm font-semibold text-gray-700">Select access role</label>
                  <div className="grid gap-3">
                    <label className={`cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${role === "spoc" ? "border-green-800 bg-green-50 shadow-sm" : "border-gray-200 bg-white hover:border-green-300 hover:bg-green-50/40"}`}>
                      <div className="flex items-start gap-4">
                        <input type="radio" checked={role === "spoc"} onChange={() => setRole("spoc")} className="mt-1 h-4 w-4 accent-green-800" />
                        <div>
                          <p className="font-semibold text-gray-900">Strategic Planning &amp; Operations Control</p>
                          <p className="mt-1 text-sm leading-5 text-gray-500">Full access</p>
                        </div>
                      </div>
                    </label>

                    <label className={`cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${role === "internal" ? "border-green-800 bg-green-50 shadow-sm" : "border-gray-200 bg-white hover:border-green-300 hover:bg-green-50/40"}`}>
                      <div className="flex items-start gap-4">
                        <input type="radio" checked={role === "internal"} onChange={() => setRole("internal")} className="mt-1 h-4 w-4 accent-green-800" />
                        <div>
                          <p className="font-semibold text-gray-900">Internal User</p>
                          <p className="mt-1 text-sm leading-5 text-gray-500">Limited access</p>
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="mb-3 block text-sm font-semibold text-gray-700">Password</label>
                  <PasswordInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    disabled={false}
                    placeholder="Enter password"
                  />
                  {role === "spoc" && (
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={() => setModal("change-password")}
                        className="text-xs text-green-800 underline underline-offset-2 hover:text-green-600 transition-colors"
                      >
                        Change password?
                      </button>
                    </div>
                  )}
                    <p className="mt-2 text-xs text-gray-500">
                      Password is required for all roles
                    </p>
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleLogin}
                  className="w-full rounded-2xl bg-green-900 px-6 py-4 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:bg-green-800 hover:shadow-xl"
                >
                  Continue
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* MODAL CHANGE PASSWORD */}
      {modal === "change-password" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h4 className="text-xl font-bold text-gray-900">Change Your Password</h4>
                <p className="mt-1 text-sm text-gray-500">SPOC — Strategic Planning &amp; Operations Control</p>
              </div>
              <button
                onClick={closeModal}
                className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">Current Password</label>
                <PasswordInput
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Enter your current password"
                />
                {oldPasswordError && (
                  <p className="mt-1 text-xs text-red-500">{oldPasswordError}</p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">New Password</label>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
                {newPasswordError && (  
                  <p className="mt-1 text-xs text-red-500">{newPasswordError}</p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">Confirm New Password</label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                />
                {confirmPasswordError && (  
                  <p className="mt-1 text-xs text-red-500">{confirmPasswordError}</p>
                )}
              </div>

              {changeError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {changeError}
                </div>
              )}

              {changeSuccess && (
                <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                  {changeSuccess}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeModal}
                  className="flex-1 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-600 transition-all hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleChangePassword}
                  disabled={changeLoading}
                  className="flex-1 rounded-2xl bg-green-900 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-green-800 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {changeLoading ? "Menyimpan..." : "Update Password"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}