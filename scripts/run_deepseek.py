
import sys
import json
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

def generate_tags(input_text):
    # Load model and tokenizer
    model_path = sys.argv[1]
    
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model = AutoModelForCausalLM.from_pretrained(
        model_path,
        torch_dtype=torch.float16,
        device_map="auto"
    )
    
    # Create prompt
    prompt = f"""
You are a tag generation system. Analyze the following content and extract the most relevant tags.
Focus on:
1. Current events, trending topics, and newsworthy items
2. People, organizations, and entities mentioned
3. Concepts, technologies, and themes
4. Geographic locations relevant to the content

Return ONLY a JSON array of tags, with no additional text or explanation.
Each tag should be a single word or short phrase (1-3 words maximum).
Limit to 30 most relevant tags.

CONTENT:
{input_text}
"""

    # Generate tags
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        outputs = model.generate(
            inputs["input_ids"],
            max_new_tokens=500,
            temperature=0.1,
            do_sample=True
        )
    
    response = tokenizer.decode(outputs[0], skip_special_tokens=True)
    
    # Extract JSON array from response
    try:
        # Try to find JSON array in the response
        start_idx = response.find('[')
        end_idx = response.rfind(']') + 1
        
        if start_idx >= 0 and end_idx > start_idx:
            json_str = response[start_idx:end_idx]
            tags = json.loads(json_str)
            return tags
        else:
            # Fallback: split by commas and clean up
            cleaned_response = response.replace(prompt, "").strip()
            tags = [tag.strip() for tag in cleaned_response.split(',') if tag.strip()]
            return tags
    except Exception as e:
        print(f"Error parsing response: {e}", file=sys.stderr)
        # Last resort fallback
        words = response.replace(prompt, "").strip().split()
        return [word for word in words if len(word) > 3][:30]

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python run_deepseek.py <model_path> <input_text>")
        sys.exit(1)
    
    input_text = sys.argv[2]
    tags = generate_tags(input_text)
    print(json.dumps(tags))
