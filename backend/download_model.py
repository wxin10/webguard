import os
from paddlenlp.transformers import AutoTokenizer, ErnieForSequenceClassification

def main():
    model_name = "ernie-3.0-mini-zh"
    save_dir = os.path.join(".", "models", "ernie-3.0-mini-zh")

    os.makedirs(save_dir, exist_ok=True)

    print(f"开始下载模型：{model_name}")
    print(f"保存目录：{os.path.abspath(save_dir)}")

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = ErnieForSequenceClassification.from_pretrained(
        model_name,
        num_classes=3
    )

    tokenizer.save_pretrained(save_dir)
    model.save_pretrained(save_dir)

    print("下载完成")
    print(f"模型已保存到：{os.path.abspath(save_dir)}")

if __name__ == "__main__":
    main()