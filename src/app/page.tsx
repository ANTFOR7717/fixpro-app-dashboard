import React from "react";
import Navbar from "@/features/marketing/components/navbar";
import { Hero } from "@/features/marketing/components/animated-hero";
import { FeaturesGrid } from "@/features/marketing/components/features-grid";
import { TechStack } from "@/features/marketing/components/tech-stack";
import { Footer } from "@/features/marketing/components/footer";

const HomePage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Hero Section */}
        <Hero />

        {/* Features Grid */}
        <FeaturesGrid />

        {/* Tech Stack */}
        <TechStack />

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
};

export default HomePage;
