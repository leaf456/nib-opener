function arrayToNumber(arr, signed = false) {
    let hexRep = []
    let num = 0

    // Create hexadecimal representation
    for (let i = 0; i < arr.length; i++) {
        hexRep.push(Math.floor(arr[i] / 16), arr[i] % 16)
    }

    // Convert hexadecimal representation to number
    for (let i in hexRep) {
        num += hexRep[i] * (16 ** (hexRep.length - 1 - i))
    }

    // Adjust for signed integers using two's complement if signed is true
    if (signed) {
        // Calculate the maximum value for the given number of bytes
        let maxVal = 2 ** (8 * arr.length)
        if (num >= maxVal / 2) {
            num -= maxVal
        }
    }

    return num
}
function parseVarint(varintStart) {
    let result = 0;
    let shift = 0;
    let index = 0;

    while (index < varintStart.length) {
        let byte = varintStart[index];
        result |= (byte & 0x7F) << shift;  // Add the lower 7 bits of the byte to the result
        if ((byte & 0x80) !== 0) {
            // MSB is 1, so this is the last byte
            break;
        }
        shift += 7;
        index += 1;
    }

	return {value: result, length: index + 1};
}
function grabDataAndCallback(fileName, callback) {
	console.log(fileName)
	fetch(fileName).then(function(response) {
		response.arrayBuffer().then(function(data) {
			let uint8 = new Uint8Array(data)
			if (uint8.length > 49) { //50: the magic number that is the minimum length for a nib file.
				callback(uint8)
			}
		})
	})
}
grabDataAndCallback("01J-lp-oVM-view-Ze5-6b-2t3.nib", function(arr) {
	console.log(arr)
	//all information obtained from https://github.com/matsmattsson/nibsqueeze/blob/master/NibArchive.md
	//every uint32 is in reverse-endian order, hence the `reverse()` function being used
	let parsed = {}
	parsed.signature = new TextDecoder().decode(arr.slice(0, 10))
	parsed.constone = arrayToNumber(arr.slice(10, 14).reverse(), false)
	parsed.consttwo = arrayToNumber(arr.slice(14, 18).reverse(), false)
	parsed.objectCount = arrayToNumber(arr.slice(18, 22).reverse(), false)
	parsed.objectOffset = arrayToNumber(arr.slice(22, 26).reverse(), false)
	parsed.keyCount = arrayToNumber(arr.slice(26, 30).reverse(), false)
	parsed.keyOffset = arrayToNumber(arr.slice(30, 34).reverse(), false)
	parsed.valueCount = arrayToNumber(arr.slice(34, 38).reverse(), false)
	parsed.valueOffset = arrayToNumber(arr.slice(38, 42).reverse(), false)
	parsed.classNameCount = arrayToNumber(arr.slice(42, 46).reverse(), false)
	parsed.classNameOffset = arrayToNumber(arr.slice(46, 50).reverse(), false)
	parsed.rawObjects = arr.slice(parsed.objectOffset, parsed.keyOffset)
	parsed.rawKeys = arr.slice(parsed.keyOffset, parsed.valueOffset)
	parsed.rawValues = arr.slice(parsed.valueOffset, parsed.classNameOffset)
	parsed.rawClassNames = arr.slice(parsed.classNameOffset, arr.length)
	parsed.parsedObjects = []
	parsed.parsedKeys = []
	parsed.parsedClassNames = []
	parsed.parsedValues = []
	
	let varIntOffset = 0
	for (let i = 0; i < parsed.objectCount; i++) {
		parsed.parsedObjects[i] = {}
		
		let temp = parseVarint(parsed.rawObjects.slice(varIntOffset, parsed.rawObjects.length))
		varIntOffset += temp.length
		parsed.parsedObjects[i].classNameIndex = temp.value
		
		temp = parseVarint(parsed.rawObjects.slice(varIntOffset, parsed.rawObjects.length))
		varIntOffset += temp.length
		parsed.parsedObjects[i].valueIndex = temp.value
		
		temp = parseVarint(parsed.rawObjects.slice(varIntOffset, parsed.rawObjects.length))
		varIntOffset += temp.length
		parsed.parsedObjects[i].valueCount = temp.value
	}
	
	varIntOffset = 0
	for (let i = 0; i < parsed.keyCount; i++) {
		parsed.parsedKeys[i] = {}
		
		let temp = parseVarint(parsed.rawKeys.slice(varIntOffset, parsed.rawKeys.length))
		varIntOffset += temp.length
		parsed.parsedKeys[i].keyNameLength = temp.value
		
		//above value determines how long the key name is.
		
		parsed.parsedKeys[i].keyNameContent = new TextDecoder().decode(parsed.rawKeys.slice(varIntOffset, varIntOffset + temp.value))
		varIntOffset += temp.value
	}	
	
	
	/*
	File Content	Description
	varint			Key index. The key used for retreiving the value. It is an offset into the list of keys.
	uint8			Value type:
						0: int8, 1 byte
						1: int16 LE, 2 bytes
						2: int32 LE, 4 bytes
						3: int64 LE, 8 bytes
						4: true
						5: false
						6: float, 4 bytes
						7: double, 8 bytes
						8: data, varint , number of bytes as specified in varint
						9: nil
						10: object reference, 4 bytes uint32 LE coding an offset into the list of objects
					Data depending on value type.
	*/
	
	//below: parse the values.
	varIntOffset = 0
	for (let i = 0; i < parsed.valueCount; i++) {
		parsed.parsedValues[i] = {}
		
		let temp = parseVarint(parsed.rawValues.slice(varIntOffset, parsed.rawValues.length))
		varIntOffset += temp.length
		parsed.parsedValues[i].keyIndex = temp.value
		
		parsed.parsedValues[i].uint8Valuetype = arrayToNumber(parsed.rawValues.slice(varIntOffset, varIntOffset + 1).reverse(), false)
		varIntOffset += 1		
		if (parsed.parsedValues[i].uint8Valuetype == 0) {
			parsed.parsedValues[i].valueTypeString = "signed int8 1 byte"
			parsed.parsedValues[i].value = arrayToNumber(parsed.rawValues.slice(varIntOffset, varIntOffset + 1).reverse(), true)
			varIntOffset += 1
		} else if (parsed.parsedValues[i].uint8Valuetype == 1) {
			parsed.parsedValues[i].valueTypeString = "signed int16 2 bytes"
			parsed.parsedValues[i].value = arrayToNumber(parsed.rawValues.slice(varIntOffset, varIntOffset + 2).reverse(), true)
			varIntOffset += 2
		} else if (parsed.parsedValues[i].uint8Valuetype == 2) {
			parsed.parsedValues[i].valueTypeString = "signed int32 4 bytes"
			parsed.parsedValues[i].value = arrayToNumber(parsed.rawValues.slice(varIntOffset, varIntOffset + 4).reverse(), true)
			varIntOffset += 4
		} else if (parsed.parsedValues[i].uint8Valuetype == 3) {
			parsed.parsedValues[i].valueTypeString = "signed int64 8 bytes"
			parsed.parsedValues[i].value = arrayToNumber(parsed.rawValues.slice(varIntOffset, varIntOffset + 8).reverse(), true)
			varIntOffset += 8
		} else if (parsed.parsedValues[i].uint8Valuetype == 4) {
			parsed.parsedValues[i].valueTypeString = "true"
			parsed.parsedValues[i].value = true
		} else if (parsed.parsedValues[i].uint8Valuetype == 5) {
			parsed.parsedValues[i].valueTypeString = "false"
			parsed.parsedValues[i].value = false
		} else if (parsed.parsedValues[i].uint8Valuetype == 6) {
			parsed.parsedValues[i].valueTypeString = "float 4 bytes"
			let buffer = new Uint8Array(parsed.rawValues.slice(varIntOffset, varIntOffset + 4)).buffer //I hate working with buffers in javascript
			parsed.parsedValues[i].value = new Float32Array(buffer)[0]
			varIntOffset += 4
		} else if (parsed.parsedValues[i].uint8Valuetype == 7) {
			parsed.parsedValues[i].valueTypeString = "double 8 byte"
			let buffer = new Uint8Array(parsed.rawValues.slice(varIntOffset, varIntOffset + 8)).buffer //I hate working with buffers in javascript
			parsed.parsedValues[i].value = new Float64Array(buffer)[0]
			varIntOffset += 8
		} else if (parsed.parsedValues[i].uint8Valuetype == 8) {
			parsed.parsedValues[i].valueTypeString = "arbitrary data type"			
			temp = parseVarint(parsed.rawValues.slice(varIntOffset, parsed.rawValues.length))
			varIntOffset += temp.length
			parsed.parsedValues[i].value = parsed.rawValues.slice(varIntOffset, varIntOffset + temp.value)
			varIntOffset += temp.value
		} else if (parsed.parsedValues[i].uint8Valuetype == 9) {
			parsed.parsedValues[i].valueTypeString = "null"
		} else if (parsed.parsedValues[i].uint8Valuetype == 10) {
			parsed.parsedValues[i].valueTypeString = "reference object offset"
			//offset is encoded as a little endian uint32 number.
			parsed.parsedValues[i].value = arrayToNumber(parsed.rawValues.slice(varIntOffset, varIntOffset + 4).reverse(), false)
			varIntOffset += 4
		}
	}
	
	//below: parse the class names.
	varIntOffset = 0
	for (let i = 0; i < parsed.classNameCount; i++) {
		parsed.parsedClassNames[i] = {}
		
		let temp = parseVarint(parsed.rawClassNames.slice(varIntOffset, parsed.rawClassNames.length))
		varIntOffset += temp.length
		parsed.parsedClassNames[i].classNameLength = temp.value
		//above value determines how long the class name is.
		
		temp = parseVarint(parsed.rawClassNames.slice(varIntOffset, parsed.rawClassNames.length))
		varIntOffset += temp.length
		parsed.parsedClassNames[i].extraInt32Values = temp.value
		parsed.parsedClassNames[i].extraInt32ValuesList = []
		
		for (let x = 0; x < parsed.parsedClassNames[i].extraInt32Values; x++) {
			//no idea what these 'extra values' are, but I'm including them just in case.
			parsed.parsedClassNames[i].extraInt32ValuesList.push(arrayToNumber(parsed.rawClassNames.slice(varIntOffset, varIntOffset + 4).reverse(), false))
			varIntOffset += 4
		}
		parsed.parsedClassNames[i].classNameContent = new TextDecoder().decode(parsed.rawClassNames.slice(varIntOffset, varIntOffset + parsed.parsedClassNames[i].classNameLength - 1))
		//the string is null-terminated, hence not including the last character
		varIntOffset += parsed.parsedClassNames[i].classNameLength
	}
	
	//below: resolve references and stuff
	
	//first step: grab keys and resolve object references
	for (let i in parsed.parsedValues) {
		parsed.parsedValues[i].key = parsed.parsedKeys[parsed.parsedValues[i].keyIndex].keyNameContent
		if (parsed.parsedValues[i].valueTypeString == "reference object offset") {
			//since the below reference is a shallow copy (also called a link, iirc) it will be a live copy. I think.
			parsed.parsedValues[i].value = parsed.parsedObjects[parsed.parsedValues[i].value]
		}
		delete parsed.parsedValues[i].keyIndex
		delete parsed.parsedValues[i].uint8Valuetype
		
	}
	//second step: grab class names for objects
	//third step: grab key/value pairs and push it into objects
	for (let i in parsed.parsedObjects) {
		parsed.parsedObjects[i].className = parsed.parsedClassNames[parsed.parsedObjects[i].classNameIndex].classNameContent
		parsed.parsedObjects[i].children = parsed.parsedValues.slice(parsed.parsedObjects[i].valueIndex, parsed.parsedObjects[i].valueIndex + parsed.parsedObjects[i].valueCount)
		//remove any unnesecary properties
		delete parsed.parsedObjects[i].classNameIndex
		delete parsed.parsedObjects[i].valueCount
		delete parsed.parsedObjects[i].valueIndex
	}
	
	
	//final object: parsed
	console.log(parsed)
})