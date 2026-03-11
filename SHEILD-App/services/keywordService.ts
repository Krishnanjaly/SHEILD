import BASE_URL from "../config/api";

export const fetchKeywords = async (userId: string | null) => {

    try {

        const response = await fetch(`${BASE_URL}/keywords/${userId}`);
        const data = await response.json();
        const filterKeywords = (kws: any) => 
            Array.isArray(kws) ? kws.filter((k: string) => k && k.trim().length > 0) : [];

        return {
            lowKeywords: filterKeywords(data.lowRiskKeywords),
            highKeywords: filterKeywords(data.highRiskKeywords)
        };
    } catch (error) {

        console.log("Keyword fetch error", error);

        return { lowKeywords: [], highKeywords: [] };

    }

};