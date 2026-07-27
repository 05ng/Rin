import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { stripImageUrlMetadata } from "../utils/image-upload";

interface SiteMetaProps {
    title?: string;
    description?: string;
    image?: string;
    type?: "website" | "article";
    children: React.ReactNode;
}

// Component to provide site metadata for pages
export function SiteMeta({ title, description, image, type = "website", children }: SiteMetaProps) {
    const siteConfig = useSiteConfig();
    const { i18n } = useTranslation();
    const [location] = useLocation();

    const siteName = siteConfig.name || "Agentic Life";
    const pageTitle = title 
        ? `${title} - ${siteName}` 
        : siteName;

    const pageDescription = description || siteConfig.description || "A lightweight personal blogging system";
    const pageImage = stripImageUrlMetadata(image || siteConfig.avatar);
    const documentLanguage = i18n.resolvedLanguage || i18n.language || 'en';
    
    // Attempt to construct canonical URL
    const canonicalUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}${location}`
        : `https://agenticlife.org${location}`;

    return (
        <>
            <Helmet htmlAttributes={{ lang: documentLanguage }}>
                <title>{pageTitle}</title>
                <meta name="description" content={pageDescription} />
                <link rel="canonical" href={canonicalUrl} />

                {/* OpenGraph */}
                <meta property="og:title" content={pageTitle} />
                <meta property="og:description" content={pageDescription} />
                <meta property="og:type" content={type} />
                <meta property="og:url" content={canonicalUrl} />
                <meta property="og:site_name" content={siteName} />
                {pageImage && <meta property="og:image" content={pageImage} />}

                {/* Twitter */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content={pageTitle} />
                <meta name="twitter:description" content={pageDescription} />
                {pageImage && <meta name="twitter:image" content={pageImage} />}
            </Helmet>
            {children}
        </>
    );
}
