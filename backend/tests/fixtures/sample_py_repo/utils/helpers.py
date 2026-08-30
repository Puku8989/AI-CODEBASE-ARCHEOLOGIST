"""Utility helper functions."""

def process_batch_items(items: list, factor: int = 2) -> list:
    """Process items through multi-stage transformation.
    
    This function has intentional nesting and cyclomatic branches for testing code metrics.
    """
    output = []
    if not items:
        return output

    for item in items:
        if isinstance(item, int):
            if item > 100:
                output.append(item * factor)
            elif item > 50:
                output.append(item + factor)
            else:
                output.append(item)
        elif isinstance(item, str):
            if len(item) > 10:
                output.append(item.upper())
            else:
                output.append(item.lower())
        else:
            output.append(None)

    return output
