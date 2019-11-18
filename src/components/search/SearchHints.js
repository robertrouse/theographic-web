import React from 'react';
import {Link} from 'gatsby';

 class SearchHints extends React.Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        return (
            <div>
                <div>
                    <p>Try searching for...</p>
                </div>
                <div>
                    <div style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
                        <div>Bible References</div>
                        <Link text="LIST ALL"></Link>
                    </div>
                    <div><Link text="Prov 25:2">Prov 25:2</Link></div>
                    <div><Link text="Acts 13">Acts 13</Link></div>
                    <div><Link text="John 3:16">John 3:16</Link></div>
                </div>
            </div>
        );
    }
}

// const styles = StyleSheet.create({
//     bottomLine:{
//         borderBottomWidth:5,
//         borderBottomColor:'#707070',
//     }

// })

export default SearchHints
