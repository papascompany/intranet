import { useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import "./forcePasswordChange.css";

export interface ForcePasswordChangeProps {
  onSubmit: (newPassword: string) => Promise<unknown>;
}

type PasswordRequirement = {
  label: string;
  test: (password: string) => boolean;
};

const passwordRequirements: PasswordRequirement[] = [
  { label: "12자 이상", test: (password) => password.length >= 12 },
  { label: "영문 대문자", test: (password) => /[A-Z]/.test(password) },
  { label: "영문 소문자", test: (password) => /[a-z]/.test(password) },
  { label: "숫자", test: (password) => /\d/.test(password) },
  { label: "특수문자", test: (password) => /[^A-Za-z0-9]/.test(password) }
];

function validationMessage(password: string, confirmation: string) {
  if (!passwordRequirements.every((requirement) => requirement.test(password))) {
    return "새 비밀번호 요구 사항을 모두 충족해 주세요.";
  }

  if (password !== confirmation) {
    return "새 비밀번호와 확인 비밀번호가 일치하지 않습니다.";
  }

  return null;
}

export function ForcePasswordChange({ onSubmit }: ForcePasswordChangeProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidMessage = submitted ? validationMessage(password, confirmation) : null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setError(null);

    const validationError = validationMessage(password, confirmation);
    if (validationError || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "비밀번호를 변경하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="force-password-change">
      <section aria-labelledby="force-password-change-title" className="force-password-change__panel">
        <header className="force-password-change__header">
          <span className="force-password-change__icon"><KeyRound aria-hidden="true" /></span>
          <div>
            <p className="force-password-change__eyebrow"><ShieldCheck aria-hidden="true" /> 계정 보안</p>
            <h1 id="force-password-change-title">비밀번호를 변경해 주세요</h1>
            <p>계정을 계속 사용하려면 새 비밀번호를 설정해야 합니다.</p>
          </div>
        </header>

        <form noValidate onSubmit={submit}>
          <div className="force-password-change__fields">
            <label htmlFor="new-password">
              <span>새 비밀번호</span>
              <input
                aria-describedby="password-requirements"
                aria-invalid={invalidMessage && !passwordRequirements.every((requirement) => requirement.test(password)) ? "true" : undefined}
                autoComplete="new-password"
                disabled={isSubmitting}
                id="new-password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <label htmlFor="confirm-new-password">
              <span>새 비밀번호 확인</span>
              <input
                aria-describedby={invalidMessage && password === confirmation ? "password-requirements" : undefined}
                aria-invalid={invalidMessage && password !== confirmation ? "true" : undefined}
                autoComplete="new-password"
                disabled={isSubmitting}
                id="confirm-new-password"
                onChange={(event) => setConfirmation(event.target.value)}
                required
                type="password"
                value={confirmation}
              />
            </label>
          </div>

          <ul className="force-password-change__requirements" id="password-requirements">
            {passwordRequirements.map((requirement) => (
              <li className={requirement.test(password) ? "is-met" : undefined} key={requirement.label}>{requirement.label}</li>
            ))}
          </ul>

          {invalidMessage ? <p className="force-password-change__error" role="alert">{invalidMessage}</p> : null}
          {error ? <p className="force-password-change__error" role="alert">{error}</p> : null}

          <button className="force-password-change__submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? "변경 중..." : "비밀번호 변경"}
          </button>
        </form>
      </section>
    </main>
  );
}
