import os
import json
import anthropic

def rule_based_fallback(indices: dict, crop_type: str, health_score: float):
    recommendations = []
    
    ndvi = indices.get("ndvi", {})
    if ndvi.get("label") == "poor":
        recommendations.append({
            "title": "Investigate Low Vigor",
            "description": "NDVI indicates poor biomass. Check for nutrient deficiencies, pests, or disease in affected zones.",
            "priority": "high"
        })
        
    ndwi = indices.get("ndwi", {})
    if ndwi.get("label") == "poor":
        recommendations.append({
            "title": "Assess Water Stress",
            "description": "NDWI is low, suggesting possible drought stress. Consider reviewing irrigation schedules.",
            "priority": "high"
        })
        
    lst = indices.get("lst", {}).get("mean")
    if lst and lst > 35:
        recommendations.append({
            "title": "High Canopy Temperature",
            "description": f"Land surface temperature is elevated ({lst:.1f}°C), exacerbating evapotranspiration.",
            "priority": "medium"
        })
        
    if not recommendations:
        if health_score and health_score > 80:
            recommendations.append({
                "title": "Maintain Current Practices",
                "description": "Crop health appears optimal across major indices. Continue current agronomic plan.",
                "priority": "low"
            })
        else:
            recommendations.append({
                "title": "General Field Scouting",
                "description": "Health score is moderate. Perform standard scouting to identify localized issues.",
                "priority": "medium"
            })
            
    return recommendations

def generate_recommendations(indices: dict, crop_type: str, health_score: float):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    
    if not api_key or api_key == "your-anthropic-key":
        return rule_based_fallback(indices, crop_type, health_score)
        
    try:
        client = anthropic.Anthropic(api_key=api_key)
        
        prompt = f"""
        You are an expert agronomist analyzing satellite data for a {crop_type} field.
        The overall health score is {health_score}%.
        Here are the latest indices:
        {json.dumps(indices, indent=2)}
        
        Provide 2-3 specific, actionable recommendations for the farmer.
        """
        
        tools = [
            {
                "name": "provide_recommendations",
                "description": "Provide a list of agronomic recommendations based on the field data.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "recommendations": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": {"type": "string", "description": "Short, actionable title"},
                                    "description": {"type": "string", "description": "Detailed explanation of what to do and why"},
                                    "priority": {"type": "string", "enum": ["low", "medium", "high"]}
                                },
                                "required": ["title", "description", "priority"]
                            }
                        }
                    },
                    "required": ["recommendations"]
                }
            }
        ]
        
        response = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=500,
            tools=tools,
            tool_choice={"type": "tool", "name": "provide_recommendations"},
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        
        for block in response.content:
            if block.type == "tool_use" and block.name == "provide_recommendations":
                return block.input.get("recommendations", [])
                
        return rule_based_fallback(indices, crop_type, health_score)
    except Exception as e:
        print(f"LLM generation failed: {e}. Falling back to rules.")
        return rule_based_fallback(indices, crop_type, health_score)
