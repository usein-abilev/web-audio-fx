export const print10Numbers = () => {
    const array_size = 10;
    const test23242 = "some_string";
    const another_object = {
        "test": 1234,
        "test2": [1, 2, 3, 4, 5],
        meta: { 
            data: new Array({ length: array_size }),
            size: array_size,
        },
    };
    for (let i = 0; i < 100; i++) {
        console.log("printing number %i", i, i + 1, test23242);
    }
}
