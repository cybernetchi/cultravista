// Sign-in / sign-up screen. Email+password (tabbed) plus Google OAuth.
// Dark theme, responsive, with explicit loading + error states.
import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Mode = "signin" | "signup";

export default function Auth() {
  const { session, loading, signIn, signUp, signInWithGoogle } = useAuth();
  const location = useLocation();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Where to send the user after a successful sign-in.
  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? "/";

  // Already signed in (e.g. returning via OAuth redirect) — bounce to the app.
  if (!loading && session) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    const action = mode === "signin" ? signIn : signUp;
    const { error: authError } = await action(email, password);

    setSubmitting(false);

    if (authError) {
      setError(authError);
      return;
    }

    if (mode === "signup") {
      // Depending on project settings the user may need to confirm via email.
      setInfo("Account created. Check your inbox if email confirmation is required.");
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setSubmitting(true);
    const { error: oauthError } = await signInWithGoogle();
    if (oauthError) {
      setError(oauthError);
      setSubmitting(false);
    }
    // On success the browser redirects to Google, so no further state needed.
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">CultraVista</CardTitle>
          <CardDescription>
            Sign in to manage your heritage captures
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); setError(null); setInfo(null); }}>
            {/* h-12 list / h-10 triggers: comfortable tap targets on phones */}
            <TabsList className="grid w-full grid-cols-2 h-12">
              <TabsTrigger value="signin" className="h-10">Sign in</TabsTrigger>
              <TabsTrigger value="signup" className="h-10">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value={mode} className="mt-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    className="h-11"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    className="h-11"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    disabled={submitting}
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                {info && (
                  <p className="text-sm text-muted-foreground" role="status">
                    {info}
                  </p>
                )}

                <Button type="submit" className="w-full h-11" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {mode === "signin" ? "Sign in" : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-11"
            onClick={handleGoogle}
            disabled={submitting}
          >
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
