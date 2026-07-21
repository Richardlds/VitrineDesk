import js from "@eslint/js";
import globals from "globals";

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.node,
                supabase: "readonly",
                Stripe: "readonly",
                lucide: "readonly",
                FullCalendar: "readonly",
                Swiper: "readonly"
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-undef": "warn",
            "no-empty": "warn",
            "no-control-regex": "warn"
        }
    }
];
