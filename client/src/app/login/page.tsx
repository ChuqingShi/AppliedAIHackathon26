import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { login } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { getAccounts } from "@/data/accounts";
import { ROLE_LABEL } from "@/data/nav";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in · CaseBoard" };

export default async function LoginPage() {
  if (await getSession()) redirect("/overview");
  const accounts = await getAccounts();
  return (
    <main className="login">
      <form className="login-card" action={login}>
        <div className="logo"><span><Icon name="shield" /></span>CaseBoard</div>
        <h1>Sign in</h1>
        <p>One dashboard for the whole case. What you see depends on who you are.</p>
        {accounts.map((a) => (
          <button key={a.id} name="account" value={a.id} className="acct">
            <span className="av">{a.initials}</span>
            <div><b>{a.name}</b><small>{a.title}</small></div>
            <span className="tag shared">{ROLE_LABEL[a.role]}</span>
          </button>
        ))}
        <small className="note">Demo accounts · everyone on the case in Clio</small>
      </form>
    </main>
  );
}
