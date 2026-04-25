export function Footer() {
  return (
    <div className="text-center mt-12 pt-8 border-t border-border/50">
      <p className="text-sm text-muted-foreground w-full flex align-center">
        © {new Date().getFullYear()} Fix Pro AI. All rights reserved.
      </p>
    </div>
  );
}
