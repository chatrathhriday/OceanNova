from .model import train_and_save

if __name__ == "__main__":
    model = train_and_save()
    print("OCEANNOVA v6 model trained")
    print(model.metrics)
